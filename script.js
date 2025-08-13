// script.js (non-module, works with the included three.min.js + OrbitControls.js)

let scene, camera, renderer, controls;
let waterMesh, boat, rod, rodTip;
let bobber, hook, line;
let fishes = [];
let score = 0;
let gameState = 'ready'; // ready | casting | inwater | reeling
let bobberVel = new THREE.Vector3();
let reelBoost = 0;
const gravity = new THREE.Vector3(0, -9.8, 0);
const waterLevel = 0;

const statusTextEl = document.getElementById('statusText');
const scoreEl = document.getElementById('score');
const castButton = document.getElementById('castButton');
const reelButton = document.getElementById('reelButton');
const toggleDayBtn = document.getElementById('toggleDay');
const minimap = document.getElementById('minimap');

// Init scene
function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071022);
  scene.fog = new THREE.Fog(0x071022, 40, 220);

  camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
  camera.position.set(16, 10, 20);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.getElementById('game-container').appendChild(renderer.domElement);

  // Controls (touch + mouse)
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.49;

  // Lights
  const hemi = new THREE.HemisphereLight(0xbdd7ff, 0x0c1620, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(20, 30, 10);
  dir.castShadow = true;
  scene.add(dir);

  // Water: PlaneBufferGeometry (we'll displace Z in buffer)
  const wGeo = new THREE.PlaneBufferGeometry(400, 400, 160, 160);
  const wMat = new THREE.MeshStandardMaterial({ color: 0x083b56, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  waterMesh = new THREE.Mesh(wGeo, wMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // Boat + rod
  boat = new THREE.Group();
  boat.position.set(0, 0.4, 0);
  scene.add(boat);

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 3.2, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0x5d3b26, roughness: 0.9 }));
  hull.rotation.z = Math.PI / 2; hull.rotation.y = Math.PI / 2;
  boat.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x8b5a36, roughness: 0.85 }));
  deck.position.y = 0.5; boat.add(deck);

  rod = new THREE.Group(); rod.position.set(0.9, 1.0, 0); boat.add(rod);
  const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rodMesh.position.y = 1.1; rodMesh.rotation.z = -Math.PI / 8; rod.add(rodMesh);

  rodTip = new THREE.Object3D(); rodTip.position.set(1.0, 2.1, 0); rod.add(rodTip);

  // Bobber + hook + line
  bobber = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x150000 }));
  bobber.visible = false; scene.add(bobber);

  hook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 12, Math.PI * 1.2),
    new THREE.MeshStandardMaterial({ color: 0xdedede }));
  hook.visible = false; scene.add(hook);

  line = null;

  // Create fishes (spheres)
  for(let i=0;i<14;i++) spawnFish();

  // Minimap context
  minimap.ctx = minimap.getContext('2d');

  // Events
  window.addEventListener('resize', onResize);
  castButton.addEventListener('click', onCast);
  reelButton.addEventListener('pointerdown', ()=> reelBoost = 1);
  reelButton.addEventListener('pointerup', ()=> reelBoost = 0);
  toggleDayBtn.addEventListener('click', toggleDayNight);
  window.addEventListener('pointerdown', (e)=> { /* allow pointer interactions to enable audio on iOS when needed */ });

  animate();
}

// spawn fish helper
function spawnFish(){
  const colors = [0x7af2ff, 0xfff27a, 0x66ffc2];
  const type = Math.floor(Math.random()*3); // affects score
  const s = 0.7 + Math.random()*0.8;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12*s, 0.3*s, 4, 10), new THREE.MeshStandardMaterial({ color: colors[type], roughness:0.7 }));
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12*s, 0.22*s, 8), new THREE.MeshStandardMaterial({ color: (colors[type]^0x222222), roughness:0.8 }));
  tail.rotation.x = Math.PI/2; tail.position.z = -0.36*s;
  g.add(body); g.add(tail);
  scene.add(g);
  g.userData = {
    r: 6 + Math.random()*18,
    speed: 0.2 + Math.random()*0.6,
    h: -0.2 + Math.random()*0.4,
    angle: Math.random()*Math.PI*2,
    type
  };
  fishes.push(g);
}

// cast logic
function spawnBobberAtRod(){
  const start = new THREE.Vector3();
  rodTip.getWorldPosition(start);
  bobber.position.copy(start);
  hook.position.copy(start).add(new THREE.Vector3(0,-0.15,0));
  bobber.visible = true; hook.visible = true;
  resetLine();
}
function onCast(){
  if(gameState !== 'ready') return;
  spawnBobberAtRod();
  const aimYaw = (camera.rotation.y || 0);
  // simple forward vector from camera orientation
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = Math.max(dir.y, -0.2); // don't aim too far down
  dir.normalize();
  bobberVel.copy(dir).multiplyScalar(12 + Math.random()*6);
  gameState = 'casting';
  statusTextEl.innerText = 'Đang ném...';
}
function resetLine(){
  if(line){ scene.remove(line); line.geometry.dispose(); line = null; }
  const p1 = rodTip.getWorldPosition(new THREE.Vector3());
  const p2 = bobber.position.clone();
  const geo = new THREE.BufferGeometry().setFromPoints([p1,p2]);
  line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xdedede, transparent:true, opacity:0.95 }));
  scene.add(line);
}
function updateLine(){
  if(!line) return;
  const p1 = rodTip.getWorldPosition(new THREE.Vector3());
  const p2 = bobber.position.clone();
  line.geometry.setFromPoints([p1,p2]);
}

// toggle day/night simple
let dayMode = true;
function toggleDayNight(){
  dayMode = !dayMode;
  if(dayMode){
    scene.background.set(0x071022);
  } else {
    scene.background.set(0x001024);
  }
}

// water displacement (buffer)
let basePositions = null;
function initWaterBase(){
  const attr = waterMesh.geometry.attributes.position;
  basePositions = new Float32Array(attr.array.length);
  basePositions.set(attr.array);
}
function updateWater(t){
  if(!basePositions) initWaterBase();
  const pos = waterMesh.geometry.attributes.position.array;
  for(let i=0;i<pos.length;i+=3){
    const x = basePositions[i];
    const y = basePositions[i+1];
    // combine a few sine waves
    const w = Math.sin((x*0.06) + t*0.9)*0.24 + Math.sin((y*0.07) - t*0.7)*0.18 + Math.sin((x*0.03 + y*0.04) + t*1.05)*0.12;
    pos[i+2] = basePositions[i+2] + w;
  }
  waterMesh.geometry.attributes.position.needsUpdate = true;
  waterMesh.geometry.computeVertexNormals();
}

// simple splash ring
const splashes = [];
function addSplash(pos){
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.04, 32), new THREE.MeshBasicMaterial({ color: 0x9ed9ff, transparent:true, opacity:0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI/2;
  ring.position.copy(pos);
  ring.position.y = waterLevel + 0.01;
  scene.add(ring);
  splashes.push({ mesh: ring, r: 0.02, life: 1.0 });
}
function updateSplashes(dt){
  for(let i=splashes.length-1;i>=0;i--){
    const s = splashes[i];
    s.r += dt*0.8;
    s.life -= dt*0.9;
    s.mesh.geometry.dispose();
    s.mesh.geometry = new THREE.RingGeometry(Math.max(s.r-0.01, 0.001), s.r, 32);
    s.mesh.material.opacity = Math.max(s.life, 0);
    if(s.life <= 0){
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      splashes.splice(i,1);
    }
  }
}

// score and catching logic
function tryCatch(){
  // if bobber near fish, chance to catch
  for(const f of fishes){
    const d = f.position.distanceTo(bobber.position);
    if(d < 0.7){
      const type = f.userData.type;
      const basePoints = type===2?5: type===1?2:1;
      // simple chance check
      const chance = 0.7 - (type*0.12) + Math.random()*0.2;
      if(Math.random() < chance){
        score += basePoints;
        scoreEl.innerText = score;
        addSplash(bobber.position);
        // respawn fish
        f.userData.r = 6 + Math.random()*18;
        f.userData.angle = Math.random()*Math.PI*2;
        f.position.set(1000,1000,1000); // hide for a frame - animate will reposition next ticks
        break;
      } else {
        // fish escapes -> push it farther
        f.userData.angle += Math.PI * (0.3 + Math.random()*0.6);
      }
    }
  }
}

// minimap drawing
function drawMinimap(){
  const ctx = minimap.getContext('2d'); const W = minimap.width, H = minimap.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = 'rgba(5,20,30,0.9)'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.strokeRect(0.5,0.5,W-1,H-1);
  const cx = W/2, cy = H/2, scale = 3.5;
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#9ef7ff';
  fishes.forEach(f=>{
    const x = cx + f.position.x*scale, y = cy + f.position.z*scale;
    if(x>=0 && x<=W && y>=0 && y<=H){
      ctx.fillRect(x-1,y-1,2,2);
    }
  });
  if(bobber.visible){
    const bx = cx + bobber.position.x*scale, by = cy + bobber.position.z*scale;
    ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(bx,by,3,0,Math.PI*2); ctx.fill();
  }
}

// loop
const clock = new THREE.Clock();
function animate(){
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = clock.getElapsedTime();

  // water
  updateWater(t);

  // boat bob
  boat.position.y = 0.4 + Math.sin(performance.now()*0.0015)*0.05;
  boat.rotation.z = Math.sin(performance.now()*0.0012)*0.02;

  // fishes movement
  fishes.forEach(f=>{
    const d = f.userData;
    d.angle += d.speed * dt;
    const x = Math.cos(d.angle) * d.r;
    const z = Math.sin(d.angle) * d.r;
    const y = waterLevel + d.h + Math.sin(d.angle*2.0) * 0.04;
    f.position.set(x, y, z);
    f.lookAt(Math.cos(d.angle+0.2)*d.r, y, Math.sin(d.angle+0.2)*d.r);
  });

  // bobber physics
  if(gameState === 'casting'){
    bobberVel.addScaledVector(gravity, dt*0.6);
    bobber.position.addScaledVector(bobberVel, dt);
    if(bobber.position.y <= waterLevel){
      bobber.position.y = waterLevel + 0.02;
      bobberVel.multiplyScalar(0.18);
      gameState = 'inwater';
      statusTextEl.innerText = 'Phao trong nước';
      addSplash(bobber.position);
      tryCatch();
    }
    updateLine();
    hook.position.copy(bobber.position).add(new THREE.Vector3(0,-0.15,0));
  } else if(gameState === 'inwater' || gameState === 'reeling'){
    // gentle bob
    const targetY = waterLevel + 0.05 + Math.sin(performance.now()*0.004 + bobber.position.x*0.2)*0.03;
    bobber.position.y += (targetY - bobber.position.y) * 0.15;

    const tip = rodTip.getWorldPosition(new THREE.Vector3());
    const toTip = tip.clone().sub(bobber.position);
    const dist = toTip.length();
    const reelSpeed = (gameState === 'reeling' ? 7 : 2) + reelBoost*8;
    const step = Math.min(dist, reelSpeed * dt);
    if(reelBoost > 0) gameState = 'reeling';
    else if(gameState === 'reeling') gameState = 'inwater';

    if(step > 0.0001){
      toTip.normalize();
      bobber.position.addScaledVector(toTip, step);
    }
    if(dist < 0.6){
      bobber.visible = false; hook.visible = false;
      if(line){ scene.remove(line); line = null; }
      gameState = 'ready'; statusTextEl.innerText = 'Sẵn sàng';
    }
    hook.position.copy(bobber.position).add(new THREE.Vector3(0,-0.15,0));
    updateLine();
    tryCatch();
  }

  updateSplashes(dt);
  drawMinimap();

  controls.update();
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

// start everything
init();
