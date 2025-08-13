import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

/* =========================================
   GLOBALS & UI
========================================= */
const ui = {
  score: document.getElementById('score'),
  combo: document.getElementById('combo'),
  state: document.getElementById('state'),
  timer: document.getElementById('timer'),
  restart: document.getElementById('btnRestart'),
  mute: document.getElementById('btnMute'),
  gameOver: document.getElementById('gameOver'),
  finalScore: document.getElementById('finalScore'),
  playAgain: document.getElementById('btnPlayAgain'),
  minimap: document.getElementById('minimap'),
};

let score = 0;
let combo = 1;
let lastCatchTime = 0;
let timeLeft = 120;
let gameEnded = false;

function setState(s){ ui.state.textContent = s; }

/* =========================================
   AUDIO (WebAudio simple beeps)
========================================= */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const actx = new AudioCtx();
let muted = false;

function beep(freq=440, dur=0.08, vol=0.15, type='sine'){
  if (muted || gameEnded) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = 0; g.gain.setTargetAtTime(vol, t, 0.01);
  g.gain.setTargetAtTime(0, t + dur*0.6, 0.05);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur);
}
ui.mute.addEventListener('click', ()=>{
  muted = !muted;
  ui.mute.textContent = muted ? 'Bật âm' : 'Tắt âm';
  beep(660, 0.05, 0.08, 'triangle');
});

/* =========================================
   THREE BASICS
========================================= */
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1220);
scene.fog = new THREE.Fog(0x06101a, 40, 220);

const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(16, 10, 20);
camera.lookAt(0, 0, 0);

// lights
scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x0c1620, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(20, 30, 10);
scene.add(dir);

/* =========================================
   SKY & WATER
========================================= */
const skyGeo = new THREE.SphereGeometry(600, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x0c2040) },
    bottomColor: { value: new THREE.Color(0x05101c) }
  },
  vertexShader: `
    varying vec3 vDir;
    void main(){
      vec4 wp = modelMatrix * vec4(position,1.0);
      vDir = normalize(wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    varying vec3 vDir;
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    void main(){
      float h = vDir.y*0.5+0.5;
      gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
    }`
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

const waterGeom = new THREE.PlaneGeometry(400, 400, 200, 200);
const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColorDeep: { value: new THREE.Color(0x072c3d) },
    uColorShallow: { value: new THREE.Color(0x1e6b8f) },
    uFoam: { value: new THREE.Color(0x9ed9ff) },
  },
  vertexShader: `
    uniform float uTime;
    varying float vH;
    void main(){
      vec3 p = position;
      float w1 = sin((p.x*0.15 + uTime*0.8))*0.25;
      float w2 = sin((p.y*0.21 - uTime*0.6))*0.22;
      float w3 = sin((p.x*0.07 + p.y*0.09 + uTime*0.9))*0.18;
      p.z += (w1+w2+w3);
      vH = p.z;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
    }`,
  fragmentShader: `
    varying float vH;
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;
    uniform vec3 uFoam;
    void main(){
      float t = smoothstep(-0.6, 0.8, vH);
      vec3 col = mix(uColorDeep, uColorShallow, t);
      float foam = smoothstep(0.25, 0.5, vH)*0.45;
      col = mix(col, uFoam, foam);
      gl_FragColor = vec4(col, 1.0);
    }`,
  side: THREE.DoubleSide
});
const water = new THREE.Mesh(waterGeom, waterMat);
water.rotation.x = -Math.PI/2;
scene.add(water);

const waterLevel = 0;

/* =========================================
   BOAT & ROD
========================================= */
const boat = new THREE.Group(); scene.add(boat);
boat.position.set(0, 0.4, 0);

const hull = new THREE.Mesh(
  new THREE.CapsuleGeometry(1.8, 3.2, 2, 10),
  new THREE.MeshStandardMaterial({ color: 0x734d28, roughness:0.9 })
);
hull.rotation.z = Math.PI/2;
hull.rotation.y = Math.PI/2;
boat.add(hull);

const deck = new THREE.Mesh(
  new THREE.BoxGeometry(2.2, 0.2, 1.2),
  new THREE.MeshStandardMaterial({ color: 0x9b6b3a, roughness:0.85 })
);
deck.position.y = 0.5; boat.add(deck);

const rod = new THREE.Group(); boat.add(rod);
rod.position.set(0.9, 1.0, 0);
const rodMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness:0.4 })
);
rodMesh.position.y = 1.1; rodMesh.rotation.z = -Math.PI/8; rod.add(rodMesh);
const rodTip = new THREE.Object3D(); rodTip.position.set(1.0, 2.1, 0); rod.add(rodTip);

/* =========================================
   BOBBER / HOOK / LINE
========================================= */
const bobber = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive:0x150000, roughness:0.6 })
);
scene.add(bobber); bobber.visible = false;

const hook = new THREE.Mesh(
  new THREE.TorusGeometry(0.08, 0.02, 10, 16, Math.PI*1.2),
  new THREE.MeshStandardMaterial({ color: 0xdedede, metalness:0.7, roughness:0.3 })
);
scene.add(hook); hook.visible = false;

let line;
const lineMat = new THREE.LineBasicMaterial({ color: 0xcccccc, transparent:true, opacity:0.9 });
function resetLine(){
  if (line) { scene.remove(line); line.geometry.dispose(); }
  const geo = new THREE.BufferGeometry().setFromPoints([rodTip.getWorldPosition(new THREE.Vector3()), bobber.position]);
  line = new THREE.Line(geo, lineMat);
  scene.add(line);
}
function updateLine(){
  if (!line) return;
  const p1 = rodTip.getWorldPosition(new THREE.Vector3());
  const p2 = bobber.position.clone();
  line.geometry.setFromPoints([p1, p2]);
  line.geometry.attributes.position.needsUpdate = true;
}

/* =========================================
   FISH SCHOOL
========================================= */
const fishGroup = new THREE.Group(); scene.add(fishGroup);
function createFish(color=0x66ffc2, scale=1){
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18*scale, 0.6*scale, 6, 12),
    new THREE.MeshStandardMaterial({ color, roughness:0.7 })
  );
  g.add(body);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.16*scale, 0.3*scale, 12),
    new THREE.MeshStandardMaterial({ color: (color ^ 0x222222), roughness:0.85 })
  );
  tail.rotation.x = Math.PI/2; tail.position.z = -0.45*scale;
  g.add(tail);
  return g;
}
const fishes = [];
const NUM_FISH = 16;
for (let i=0;i<NUM_FISH;i++){
  const f = createFish( (i%3===0)?0x7af2ff: (i%3===1?0xfff27a:0x66ffc2), 0.9 + Math.random()*0.6 );
  fishGroup.add(f);
  fishes.push({ mesh: f, r: 6 + Math.random()*14, speed: 0.2 + Math.random()*0.6, h: -0.2 + Math.random()*0.4, angle: Math.random()*Math.PI*2 });
}
function respawnFish(f){
  f.r = 6 + Math.random()*14;
  f.speed = 0.2 + Math.random()*0.6;
  f.h = -0.2 + Math.random()*0.4;
  f.angle = Math.random()*Math.PI*2;
}

/* =========================================
   INPUT / CAMERA
========================================= */
let aimYaw = 0;
let aimPitch = 0.15;
let power = 13;
let isDraggingMouse = false;
let lastMouseX = innerWidth/2;

addEventListener('mousemove', (e)=>{
  const dx = (e.clientX - lastMouseX);
  lastMouseX = e.clientX;
  aimYaw += dx * 0.0025;
});
addEventListener('wheel', (e)=>{
  camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), e.deltaY * 0.002);
});
addEventListener('mousedown', ()=>{
  if (gameEnded) return;
  if (gameState === STATE.Ready){
    cast();
  }
});
addEventListener('keydown', (e)=>{
  if (e.code === 'Space') reelBoost = 1, setState(STATE.Reeling);
  if (e.code === 'KeyR') instantReset();
  if (e.code === 'KeyM'){ muted = !muted; ui.mute.textContent = muted ? 'Bật âm' : 'Tắt âm'; }
});
addEventListener('keyup', (e)=>{
  if (e.code === 'Space'){ reelBoost = 0; if (gameState===STATE.Reeling) setState(STATE.InWater); }
});

/* =========================================
   GAME STATE
========================================= */
const STATE = { Ready: 'Sẵn sàng', Casting: 'Đang bay', InWater: 'Trong nước', Reeling: 'Đang kéo' };
let gameState = STATE.Ready;
let bobberVel = new THREE.Vector3();
const gravity = new THREE.Vector3(0, -9.8, 0);

function spawnBobberAtRod(){
  const start = rodTip.getWorldPosition(new THREE.Vector3());
  bobber.position.copy(start);
  hook.position.copy(start).add(new THREE.Vector3(0,-0.15,0));
  bobber.visible = true; hook.visible = true;
  resetLine();
}
function cast(){
  spawnBobberAtRod();
  const dir = new THREE.Vector3(
    Math.cos(aimYaw)*Math.cos(aimPitch),
    Math.sin(aimPitch)+0.05,
    Math.sin(aimYaw)*Math.cos(aimPitch)
  ).normalize();
  bobberVel.copy(dir).multiplyScalar(power);
  setState(STATE.Casting);
  beep(520, 0.06, 0.12, 'triangle');
}
function instantReset(){
  bobber.visible = false; hook.visible = false;
  if (line){ scene.remove(line); line = null; }
  setState(STATE.Ready);
}

/* =========================================
   SPLASH EFFECT
========================================= */
const splashes = [];
function addSplash(pos, color=0x9ed9ff){
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.06, 32, 1),
    new THREE.MeshBasicMaterial({ color, transparent:true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI/2;
  ring.position.copy(pos); ring.position.y = waterLevel + 0.01;
  scene.add(ring);
  splashes.push({ mesh: ring, r: 0.05, life: 1.0 });
}
function updateSplashes(dt){
  for (let i=splashes.length-1;i>=0;i--){
    const s = splashes[i];
    s.r += dt*0.8;
    s.life -= dt*0.9;
    s.mesh.geometry.dispose();
    s.mesh.geometry = new THREE.RingGeometry(Math.max(s.r-0.01,0.001), s.r, 32, 1);
    s.mesh.material.opacity = Math.max(s.life, 0);
    if (s.life<=0){
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      splashes.splice(i,1);
    }
  }
}

/* =========================================
   MINI-MAP (2D canvas)
========================================= */
const mctx = ui.minimap.getContext('2d');
function drawMinimap(){
  const ctx = mctx;
  const W = ui.minimap.width, H = ui.minimap.height;
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = 'rgba(10,30,50,0.85)';
  ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.strokeRect(0.5,0.5,W-1,H-1);

  // world -> map (center boat, scale)
  const scale = 4.0; // world 1u -> 4px
  const cx = W/2, cy = H/2;

  // draw boat
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();

  // draw fishes
  ctx.fillStyle = '#9ef7ff';
  for (const f of fishes){
    const x = cx + f.mesh.position.x * scale;
    const y = cy + f.mesh.position.z * scale;
    if (x>=0&&x<=W&&y>=0&&y<=H){
      ctx.fillRect(x-1, y-1, 2, 2);
    }
  }

  // draw bobber
  if (bobber.visible){
    ctx.fillStyle = '#ff6b6b';
    const bx = cx + bobber.position.x * scale;
    const by = cy + bobber.position.z * scale;
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI*2); ctx.fill();
  }

  // compass N
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto';
  ctx.fillText('N', W/2-3, 12);
  ctx.globalAlpha = 1;
}

/* =========================================
   TIMER & GAME LOOP
========================================= */
const clock = new THREE.Clock();

let reelBoost = 0;

function addScore(base=1){
  // combo logic
  const now = performance.now();
  if (now - lastCatchTime <= 5000) { combo = Math.min(combo+1, 9); }
  else { combo = 1; }
  lastCatchTime = now;

  score += base * combo;
  ui.score.textContent = score;
  ui.combo.textContent = 'x'+combo;

  // audio feedback
  beep(660, 0.07, 0.12, 'sine');
  setTimeout(()=> beep(880, 0.06, 0.1, 'sine'), 40);
}

function endGame(){
  gameEnded = true;
  ui.finalScore.textContent = score;
  ui.gameOver.classList.remove('hidden');
}
function restart(){
  score = 0; combo = 1; lastCatchTime = 0; timeLeft = 120; gameEnded = false;
  ui.score.textContent = score;
  ui.combo.textContent = 'x1';
  ui.timer.textContent = timeLeft;
  ui.gameOver.classList.add('hidden');
  instantReset();
}
ui.restart.addEventListener('click', restart);
ui.playAgain.addEventListener('click', restart);

// countdown
setInterval(()=>{
  if (gameEnded) return;
  timeLeft = Math.max(0, timeLeft-1);
  ui.timer.textContent = timeLeft;
  if (timeLeft === 0) endGame();
}, 1000);

// animate
function animate(){
  const dt = Math.min(clock.getDelta(), 0.033);

  // water time & gentle boat bob
  waterMat.uniforms.uTime.value += dt;
  boat.position.y = 0.4 + Math.sin(performance.now()*0.0015)*0.05;
  boat.rotation.z = Math.sin(performance.now()*0.0012)*0.02;
  boat.rotation.x = Math.cos(performance.now()*0.0011)*0.01;

  // rod aim
  rod.rotation.y = aimYaw;
  rod.rotation.x = -aimPitch*0.6;

  // fishes
  fishes.forEach(f=>{
    f.angle += f.speed*dt;
    const x = Math.cos(f.angle)*f.r;
    const z = Math.sin(f.angle)*f.r;
    const y = waterLevel + f.h + Math.sin(f.angle*2.0)*0.06;
    f.mesh.position.set(x, y, z);
    f.mesh.lookAt(Math.cos(f.angle+0.2)*f.r, y, Math.sin(f.angle+0.2)*f.r);
  });

  // bobber physics & states
  if (gameState === STATE.Casting){
    bobberVel.addScaledVector(gravity, dt*0.6);
    bobber.position.addScaledVector(bobberVel, dt);

    if (bobber.position.y <= waterLevel){
      bobber.position.y = waterLevel + 0.02;
      bobberVel.multiplyScalar(0.2);
      setState(STATE.InWater);
      addSplash(bobber.position);
      beep(280, 0.06, 0.08, 'sawtooth');
    }
    updateLine();
    hook.position.copy(bobber.position).add(new THREE.Vector3(0,-0.15,0));
  }
  else if (gameState === STATE.InWater || gameState === STATE.Reeling){
    const targetY = waterLevel + 0.05 + Math.sin(performance.now()*0.004 + bobber.position.x*0.2)*0.03;
    bobber.position.y += (targetY - bobber.position.y) * 0.15;

    const tip = rodTip.getWorldPosition(new THREE.Vector3());
    const toTip = tip.clone().sub(bobber.position);
    const dist = toTip.length();
    const reelSpeed = (gameState===STATE.Reeling ? 7 : 2) + reelBoost*8;
    const step = Math.min(dist, reelSpeed*dt);
    if (reelBoost>0) setState(STATE.Reeling); else if (gameState===STATE.Reeling) setState(STATE.InWater);

    if (step>0.0001){
      toTip.normalize();
      bobber.position.addScaledVector(toTip, step);
      if (gameState===STATE.Reeling && step>0) beep(200+Math.random()*40, 0.015, 0.02, 'square'); // nhẹ
    }

    if (dist < 0.6){
      bobber.visible = false; hook.visible = false;
      if (line){ scene.remove(line); line = null; }
      setState(STATE.Ready);
    }
    hook.position.copy(bobber.position).add(new THREE.Vector3(0,-0.15,0));
    updateLine();

    // catch check
    for (const f of fishes){
      const d = f.mesh.position.distanceTo(bobber.position);
      if (d < 0.6){
        addScore(1);
        addSplash(bobber.position, 0xffffff);
        respawnFish(f);
        // visual feedback
        bobber.material.emissive.setHex(0x331111);
        setTimeout(()=> bobber.material.emissive.setHex(0x150000), 100);
        break;
      }
    }
  }

  // splashes
  updateSplashes(dt);

  // draw world & minimap
  renderer.render(scene, camera);
  drawMinimap();

  requestAnimationFrame(animate);
}
animate();

/* =========================================
   RESIZE
========================================= */
addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
