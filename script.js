// script.js (module)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

/* ========== UI & persistent data ========== */
const ui = {
  score: document.getElementById('score'),
  highscore: document.getElementById('highscore'),
  level: document.getElementById('level'),
  timer: document.getElementById('timer'),
  btnCast: document.getElementById('btnCast'),
  btnReel: document.getElementById('btnReel'),
  btnUpgrade: document.getElementById('btnUpgrade'),
  btnShop: document.getElementById('btnShop'),
  shopPanel: document.getElementById('shopPanel'),
  btnToggleAudio: document.getElementById('btnToggleAudio'),
  btnToggleDay: document.getElementById('btnToggleDay'),
  state: document.querySelector('#state span'),
  minimap: document.getElementById('minimap'),
  saveData: document.getElementById('saveData'),
  clearData: document.getElementById('clearData')
};

// default player data
let DATA = {
  score: 0,
  highscore: 0,
  power: 14,         // lực ném (tăng khi upgrade)
  items: { bait: 0, hook: 0 }, // counts owned
  timeLeft: 120
};

// try load saved data
function loadData(){
  try {
    const raw = localStorage.getItem('ultrafish_data_v1');
    if(raw) {
      const parsed = JSON.parse(raw);
      DATA = Object.assign(DATA, parsed);
    }
  } catch(e){ console.warn('Load data failed', e); }
}
function saveData(){
  try {
    localStorage.setItem('ultrafish_data_v1', JSON.stringify(DATA));
    alert('Đã lưu dữ liệu!');
  } catch(e){ alert('Lưu thất bại'); }
}
function clearData(){
  localStorage.removeItem('ultrafish_data_v1'); alert('Dữ liệu đã xóa — tải lại trang để reset trạng thái.'); 
}

// init load
loadData();

/* ========== UI initialization ========== */
ui.score.textContent = DATA.score;
ui.highscore.textContent = DATA.highscore;
ui.level.textContent = 1 + Math.floor(DATA.score / 300);
ui.timer.textContent = DATA.timeLeft;

/* Shop open/close & buy logic */
document.getElementById('btnShop').addEventListener('click', ()=> ui.shopPanel.classList.remove('hidden'));
document.getElementById('closeShop').addEventListener('click', ()=> ui.shopPanel.classList.add('hidden'));
document.querySelectorAll('.shop .buy').forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    const item = btn.dataset.item;
    const price = parseInt(btn.dataset.price,10);
    if (DATA.score >= price){
      DATA.score -= price;
      DATA.items[item] = (DATA.items[item]||0) + 1;
      ui.score.textContent = DATA.score;
      playTone(880,0.1,'sine',0.12);
      ui.shopPanel.classList.add('hidden');
      // immediate effect: bait increases catch chance logic handled below
    } else {
      alert('Không đủ điểm để mua!');
    }
  });
});
document.getElementById('saveData').addEventListener('click', saveData);
document.getElementById('clearData').addEventListener('click', clearData);

/* ========== Audio (WebAudio) ========== */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const actx = new AudioCtx();
let audioOn = true;
function playTone(freq=440,dur=0.08, type='sine', gain=0.08){
  if(!audioOn) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = gain; g.gain.setTargetAtTime(0, actx.currentTime + dur*0.9, 0.02);
  o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
}
document.getElementById('btnToggleAudio').addEventListener('click', ()=>{
  audioOn = !audioOn;
  document.getElementById('btnToggleAudio').textContent = audioOn? 'Tắt âm' : 'Bật âm';
});

/* ========== THREE.js scene (water, boat, fish, etc.) ========== */
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x051322, 40, 200);

const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(18, 10, 24);
camera.lookAt(0,0,0);

const hemi = new THREE.HemisphereLight(0xbfeaff, 0x0b1a2a, 0.8); scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.2); dir.position.set(20, 30, 10); dir.castShadow = true; scene.add(dir);

const skyGeo = new THREE.SphereGeometry(600, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { topColor:{value:new THREE.Color(0x88d1ff)}, bottomColor:{value:new THREE.Color(0x051322)} },
  vertexShader: `varying vec3 vWorld;void main(){vWorld = (modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
  fragmentShader: `varying vec3 vWorld;uniform vec3 topColor;uniform vec3 bottomColor;void main(){float h = normalize(vWorld).y*0.5+0.5;gl_FragColor=vec4(mix(bottomColor, topColor, h),1.0);}`
});
const sky = new THREE.Mesh(skyGeo, skyMat); scene.add(sky);

const waterGeom = new THREE.PlaneGeometry(500,500,220,220);
const waterMat = new THREE.ShaderMaterial({
  uniforms:{
    uTime:{value:0},
    uDeep:{value:new THREE.Color(0x072b3b)},
    uShallow:{value:new THREE.Color(0x1f78a0)},
    uSpec:{value:1.2},
  },
  vertexShader: `
    uniform float uTime; varying float vH; varying vec3 vPos;
    void main(){
      vec3 p = position;
      float w1 = sin((p.x*0.12 + uTime*0.9))*0.24;
      float w2 = sin((p.y*0.14 - uTime*0.6))*0.18;
      float w3 = sin((p.x*0.06 + p.y*0.09 + uTime*1.1))*0.12;
      p.z += (w1 + w2 + w3);
      vH = p.z;
      vPos = p;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
    }`,
  fragmentShader: `
    uniform vec3 uDeep; uniform vec3 uShallow; uniform float uSpec;
    varying float vH; void main(){
      float t = smoothstep(-0.6,0.8,vH);
      vec3 c = mix(uDeep, uShallow, t);
      float spec = pow(max(0.0, 1.0 - abs(vH)), 6.0) * uSpec;
      gl_FragColor = vec4(c + spec*vec3(1.0), 1.0);
    }`,
  side: THREE.DoubleSide
});
const water = new THREE.Mesh(waterGeom, waterMat); water.rotation.x = -Math.PI/2; scene.add(water);
const waterLevel = 0;

// boat + rod
const boat = new THREE.Group(); boat.position.set(0,0.4,0); scene.add(boat);
const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.8,3.2,4,12), new THREE.MeshStandardMaterial({color:0x7a4b2d, roughness:0.9}));
hull.rotation.z = Math.PI/2; hull.rotation.y = Math.PI/2; hull.castShadow=true; boat.add(hull);
const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.2,1.2), new THREE.MeshStandardMaterial({color:0x9b6b3a, roughness:0.85})); deck.position.y=0.5; boat.add(deck);

const rod = new THREE.Group(); rod.position.set(0.9,1.0,0); boat.add(rod);
const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,2.6,10), new THREE.MeshStandardMaterial({color:0x222222}));
rodMesh.position.y=1.3; rodMesh.rotation.z=-Math.PI/10; rod.add(rodMesh);
const rodTip = new THREE.Object3D(); rodTip.position.set(1.05,2.3,0); rod.add(rodTip);

// bobber/hook/line
const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.12,16,16), new THREE.MeshStandardMaterial({color:0xff4d4d, emissive:0x150000})); scene.add(bobber); bobber.visible=false;
const hook = new THREE.Mesh(new THREE.TorusGeometry(0.08,0.02,10,16,Math.PI*1.2), new THREE.MeshStandardMaterial({color:0xdedede, metalness:0.7})); scene.add(hook); hook.visible=false;
let line=null; const lineMat = new THREE.LineBasicMaterial({color:0xcccccc, transparent:true, opacity:0.95});
function resetLine(){ if(line){ scene.remove(line); line.geometry.dispose(); } line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([rodTip.getWorldPosition(new THREE.Vector3()), bobber.position]), lineMat); scene.add(line); }
function updateLine(){ if(!line) return; const p1 = rodTip.getWorldPosition(new THREE.Vector3()); const p2 = bobber.position.clone(); line.geometry.setFromPoints([p1,p2]); line.geometry.attributes.position.needsUpdate=true; }

// fishes
const fishGroup = new THREE.Group(); scene.add(fishGroup);
function createFish(type=0){
  const g = new THREE.Group();
  const scale = [0.6, 1.0, 1.6][type];
  const color = [0x66ffc2, 0xfff27a, 0xff8b6b][type];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12*scale, 0.45*scale, 6, 12), new THREE.MeshStandardMaterial({color, roughness:0.7}));
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12*scale,0.22*scale,12), new THREE.MeshStandardMaterial({color:(color^0x222222), roughness:0.85}));
  tail.rotation.x = Math.PI/2; tail.position.z = -0.36*scale; g.add(body); g.add(tail);
  return {group:g, type, scale};
}
const fishes=[]; const NUM=20;
for(let i=0;i<NUM;i++){
  const t = Math.floor(Math.random()*3);
  const f = createFish(t);
  fishGroup.add(f.group);
  fishes.push({mesh:f.group, r:6+Math.random()*18, speed:0.2+Math.random()*0.8, h:-0.2+Math.random()*0.6, angle:Math.random()*Math.PI*2, type:t});
}
function respawnFish(f){
  f.r = 6 + Math.random()*18; f.speed = 0.2 + Math.random()*0.8; f.h = -0.2 + Math.random()*0.6; f.angle = Math.random()*Math.PI*2;
}

/* ========== GAME STATE & INPUT ========== */
const STATE = {Ready:'Sẵn sàng', Casting:'Đang bay', InWater:'Trong nước', Reeling:'Đang kéo'};
let gameState = STATE.Ready;
let bobberVel = new THREE.Vector3(), gravity = new THREE.Vector3(0,-9.8,0);
let aimYaw = 0, aimPitch = 0.12, power = DATA.power || 14;
let reelBoost = 0;

function spawnBobberAtRod(){
  const start = rodTip.getWorldPosition(new THREE.Vector3());
  bobber.position.copy(start); hook.position.copy(start).add(new THREE.Vector3(0,-0.15,0));
  bobber.visible=true; hook.visible=true; resetLine();
}
function cast(){
  if(gameState !== STATE.Ready) return;
  spawnBobberAtRod();
  const dir = new THREE.Vector3(Math.cos(aimYaw)*Math.cos(aimPitch), Math.sin(aimPitch)+0.03, Math.sin(aimYaw)*Math.cos(aimPitch)).normalize();
  bobberVel.copy(dir).multiplyScalar(power);
  setState(STATE.Casting);
  playTone(520,0.06,'triangle',0.12);
}
function instantReset(){
  bobber.visible=false; hook.visible=false; if(line){ scene.remove(line); line=null;}
  setState(STATE.Ready);
}
function setState(s){ gameState=s; ui.state.textContent = s; }

/* ========== SPLASH ========== */
const splashes=[];
function addSplash(pos, color=0x9ed9ff){
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.02,0.04,32,1), new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.95}));
  ring.rotation.x = -Math.PI/2; ring.position.copy(pos); ring.position.y = waterLevel + 0.01;
  scene.add(ring); splashes.push({mesh:ring,r:0.02,life:1.0});
}
function updateSplashes(dt){
  for(let i=splashes.length-1;i>=0;i--){
    const s=splashes[i]; s.r += dt*0.6; s.life -= dt*0.9;
    s.mesh.geometry.dispose(); s.mesh.geometry = new THREE.RingGeometry(Math.max(s.r-0.01,0.001), s.r, 32, 1);
    s.mesh.material.opacity = Math.max(s.life,0);
    if(s.life<=0){ scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); splashes.splice(i,1); }
  }
}

/* ========== MINIMAP ========== */
const mctx = ui.minimap.getContext('2d');
function drawMinimap(){
  const W = ui.minimap.width, H = ui.minimap.height;
  mctx.clearRect(0,0,W,H);
  mctx.fillStyle = 'rgba(10,40,60,0.9)';
  mctx.fillRect(0,0,W,H); mctx.strokeStyle='rgba(255,255,255,0.08)'; mctx.strokeRect(0.5,0.5,W-1,H-1);
  const cx=W/2, cy=H/2, scale=3.5;
  mctx.fillStyle = '#ffd27a'; mctx.beginPath(); mctx.arc(cx,cy,5,0,Math.PI*2); mctx.fill();
  for(const f of fishes){
    const x = cx + f.mesh.position.x*scale, y = cy + f.mesh.position.z*scale;
    mctx.fillStyle = f.type===2? '#ff8b6b': (f.type===1? '#fff27a': '#9ef7ff');
    if(x>=0 && x<=W && y>=0 && y<=H) mctx.fillRect(x-1,y-1,2,2);
  }
  if(bobber.visible){ const bx = cx + bobber.position.x*scale, by = cy + bobber.position.z*scale; mctx.fillStyle='#ff6b6b'; mctx.beginPath(); mctx.arc(bx,by,3,0,Math.PI*2); mctx.fill(); }
}

/* ========== SCORING / ITEMS EFFECTS ========== */
let lastCatchTime = 0, combo = 1;
function addScore(base=1, fishType=0){
  // items affect score and catch chance
  const now = performance.now();
  if(now - lastCatchTime <= 5000) combo = Math.min(combo+1, 6); else combo = 1;
  lastCatchTime = now;
  // hook item increases points for big fish
  let bonus = 0;
  if(DATA.items.hook && fishType === 2) bonus = Math.floor(base*1.5);
  DATA.score += (base + bonus) * combo;
  if(DATA.score > DATA.highscore) DATA.highscore = DATA.score;
  ui.score.textContent = DATA.score; ui.highscore.textContent = DATA.highscore;
  ui.level.textContent = 1 + Math.floor(DATA.score / 300);
  playTone(660,0.07,'sine',0.12);
}

function buyChanceModifier(){
  // returns a multiplier added to base catch chance depending on bait count
  return 0.02 * (DATA.items.bait || 0); // each bait adds 2% chance
}

/* ========== INPUT ========== */
let lastMouseX = innerWidth/2;
addEventListener('mousemove', (e) => { const dx = (e.clientX - lastMouseX); lastMouseX = e.clientX; aimYaw += dx * 0.0025; });
addEventListener('wheel', (e)=> camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), e.deltaY*0.002));
document.getElementById('btnCast').addEventListener('click', cast);
document.getElementById('btnReel').addEventListener('mousedown', ()=> reelBoost = 1);
addEventListener('keydown', (e)=>{ if(e.code==='Space') reelBoost=1; if(e.code==='KeyR') instantReset(); if(e.code==='KeyM') { audioOn = !audioOn; } });
addEventListener('keyup', (e)=>{ if(e.code==='Space') reelBoost=0; });
document.getElementById('btnUpgrade').addEventListener('click', ()=>{
  if(DATA.score >= 100){ DATA.score -= 100; DATA.power += 2; power = DATA.power; ui.score.textContent = DATA.score; playTone(880,0.1,'sine',0.12); } else alert('Cần 100 điểm để nâng cấp!');
});
document.getElementById('btnToggleDay').addEventListener('click', ()=> toggleDayNight());
document.getElementById('btnShop').addEventListener('click', ()=> ui.shopPanel.classList.remove('hidden'));

/* ========== DAY/NIGHT ========== */
let dayMode = true;
function toggleDayNight(){
  dayMode = !dayMode;
  if(dayMode){
    skyMat.uniforms.topColor.value.set(0x88d1ff);
    skyMat.uniforms.bottomColor.value.set(0x051322);
    hemi.intensity = 0.9; dir.intensity = 1.2;
    waterMat.uniforms.uShallow.value.set(0x1f78a0); waterMat.uniforms.uDeep.value.set(0x072b3b);
  } else {
    skyMat.uniforms.topColor.value.set(0x07213a);
    skyMat.uniforms.bottomColor.value.set(0x020612);
    hemi.intensity = 0.3; dir.intensity = 0.5;
    waterMat.uniforms.uShallow.value.set(0x0a2a3e); waterMat.uniforms.uDeep.value.set(0x021526);
  }
}

/* ========== TIMER ========== */
let timeLeft = DATA.timeLeft || 120;
ui.timer.textContent = timeLeft;
let gameEnded = false;
setInterval(()=>{
  if(gameEnded) return;
  timeLeft = Math.max(0, timeLeft-1); ui.timer.textContent = timeLeft;
  if(timeLeft === 0){ gameEnded = true; showGameOver(); saveOnExit(); }
}, 1000);

function showGameOver(){
  const overlay = document.createElement('div'); overlay.id='game-over';
  overlay.innerHTML = `<div class="panel"><h2>⏰ Hết giờ!</h2><p>Điểm: <b>${DATA.score}</b></p><p>Highscore: <b>${DATA.highscore}</b></p><button id="playAgain">Chơi lại</button></div>`;
  document.body.appendChild(overlay);
  document.getElementById('playAgain').addEventListener('click', ()=> location.reload());
}

/* ========== ANIMATION & PHYSICS ========== */
const clock = new THREE.Clock();
let bobberLaunched=false;
function animate(){
  const dt = Math.min(clock.getDelta(), 0.033);
  waterMat.uniforms.uTime.value += dt;
  boat.position.y = 0.4 + Math.sin(performance.now()*0.0015)*0.05;
  boat.rotation.z = Math.sin(performance.now()*0.0012)*0.02;
  rod.rotation.y = aimYaw; rod.rotation.x = -aimPitch*0.6;

  fishes.forEach(f=>{
    f.angle += f.speed * dt;
    const x = Math.cos(f.angle) * f.r;
    const z = Math.sin(f.angle) * f.r;
    const y = waterLevel + f.h + Math.sin(f.angle*2.0) * 0.04;
    f.mesh.position.set(x, y, z);
    f.mesh.lookAt(Math.cos(f.angle+0.2)*f.r, y, Math.sin(f.angle+0.2)*f.r);
  });

  if(gameState === STATE.Casting){
    bobberVel.addScaledVector(gravity, dt*0.6);
    bobber.position.addScaledVector(bobberVel, dt);
    if(bobber.position.y <= waterLevel){
      bobber.position.y = waterLevel + 0.02; bobberVel.multiplyScalar(0.2); setState(STATE.InWater);
      addSplash(bobber.position); playTone(280,0.06,'sawtooth',0.08);
    }
    updateLine(); hook.position.copy(bobber.position).add(new THREE.Vector3(0,-0.15,0));
  } else if(gameState === STATE.InWater || gameState === STATE.Reeling){
    const targetY = waterLevel + 0.05 + Math.sin(performance.now()*0.004 + bobber.position.x*0.2)*0.03;
    bobber.position.y += (targetY - bobber.position.y) * 0.15;
    const tip = rodTip.getWorldPosition(new THREE.Vector3());
    const toTip = tip.clone().sub(bobber.position);
    const dist = toTip.length();
    const reelSpeed = (gameState===STATE.Reeling ? 7 : 2) + reelBoost*8;
    const step = Math.min(dist, reelSpeed*dt);
    if(reelBoost>0) setState(STATE.Reeling); else if(gameState===STATE.Reeling) setState(STATE.InWater);
    if(step>0.0001){ toTip.normalize(); bobber.position.addScaledVector(toTip, step); if(gameState===STATE.Reeling) playTone(200+Math.random()*40,0.015,'square',0.02); }
    if(dist < 0.6){ bobber.visible=false; hook.visible=false; if(line){ scene.remove(line); line=null;} setState(STATE.Ready); }
    hook.position.copy(bobber.position).add(new THREE.Vector3(0,-0.15,0)); updateLine();

    // catch logic with item modifiers
    for(const f of fishes){
      const d = f.mesh.position.distanceTo(bobber.position);
      if(d < 0.6){
        // base catch chance influenced by bait item
        const baseChance = 0.65; // default
        const baitBonus = buyChanceModifier(); // small extra
        const chance = Math.min(0.98, baseChance + baitBonus + (f.type===2? -0.15:0)); // big fish slightly harder
        if(Math.random() < chance){
          // caught!
          addScore( (f.type===2)? 5 : (f.type===1? 2 : 1), f.type );
          addSplash(bobber.position, 0xffffff); respawnFish(f);
          bobber.material.emissive.setHex(0x331111);
          setTimeout(()=> bobber.material.emissive.setHex(0x150000), 120);
        } else {
          // fish escaped
          // small penalty: move fish away
          f.angle += Math.PI * (0.4 + Math.random()*0.8);
        }
        break;
      }
    }
  }

  updateSplashes(dt);
  renderer.render(scene, camera);
  drawMinimap();

  if(!gameEnded) requestAnimationFrame(animate);
}
animate();

/* ========== CAST ON CLICK & INPUT ========== */
addEventListener('mousedown', (e)=>{
  if(gameEnded) return;
  if(gameState===STATE.Ready) cast();
});
addEventListener('mousemove', (e)=>{ const dx = (e.clientX - (window._lastMouseX||innerWidth/2)); window._lastMouseX = e.clientX; aimYaw += dx * 0.0025; });
addEventListener('keydown', (e)=>{ if(e.code==='Space') reelBoost=1; if(e.code==='KeyR') instantReset(); if(e.code==='KeyM'){ audioOn = !audioOn; } });
addEventListener('keyup', (e)=>{ if(e.code==='Space') reelBoost=0; });

/* ========== RESIZE ========== */
addEventListener('resize', ()=>{ camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

/* ========== SAVE on exit ========= */
function saveOnExit(){
  DATA.score = DATA.score || 0;
  DATA.timeLeft = Math.max(0, timeLeft);
  DATA.power = power;
  try { localStorage.setItem('ultrafish_data_v1', JSON.stringify(DATA)); } catch(e) {}
}
window.addEventListener('beforeunload', saveOnExit);

// Helper: toggle day/night initial
let dayMode = true;
function toggleDayNight(){
  dayMode = !dayMode;
  if(dayMode){
    skyMat.uniforms.topColor.value.set(0x88d1ff); skyMat.uniforms.bottomColor.value.set(0x051322); hemi.intensity = 0.9; dir.intensity = 1.2;
    waterMat.uniforms.uShallow.value.set(0x1f78a0); waterMat.uniforms.uDeep.value.set(0x072b3b);
  } else {
    skyMat.uniforms.topColor.value.set(0x07213a); skyMat.uniforms.bottomColor.value.set(0x020612); hemi.intensity = 0.3; dir.intensity = 0.5;
    waterMat.uniforms.uShallow.value.set(0x0a2a3e); waterMat.uniforms.uDeep.value.set(0x021526);
  }
}
toggleDayNight(); // set initial state

/* ========== Debug / expose some controls for testing ========== */
window._ULTRAFISH = {
  DATA, saveData, loadData, addScore
};
