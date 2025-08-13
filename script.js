// script.js (sửa để chạy được với three.min.js + OrbitControls.js non-module)
let scene, camera, renderer, controls;
let waterMesh, rod;
let fishList = [];
let fishing = false;
let score = 0;
let isDay = true;

const statusText = document.getElementById("status");
const scoreText = document.getElementById("score");

// âm thanh (nếu trình duyệt chặn autoplay, bấm 1 lần trên trang để cho phép)
const soundCatch = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_5e1a8d9f62.mp3?filename=success-1-6297.mp3");
const soundCast = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_4e2f0a7fcd.mp3?filename=throw-wood-stick-5.mp3");

// Init
function init(){
  // scene / camera / renderer
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#87CEEB");

  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 2000);
  camera.position.set(0, 10, 25);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.getElementById("game-container").appendChild(renderer.domElement);

  // controls (OrbitControls script must be loaded)
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.48;

  // lights
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(10, 20, 10);
  dir.castShadow = true;
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  // water: create a PlaneBufferGeometry and keep reference to position attribute
  const waterGeom = new THREE.PlaneBufferGeometry(200, 200, 128, 128);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1E90FF, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // rod
  const rodGeo = new THREE.CylinderGeometry(0.1, 0.1, 10, 12);
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
  rod = new THREE.Mesh(rodGeo, rodMat);
  rod.position.set(0, 5, 0);
  rod.castShadow = true;
  scene.add(rod);

  // spawn fishes
  for(let i=0;i<12;i++) spawnFish();

  window.addEventListener("resize", onWindowResize);
  animate();
}

// spawn a simple fish (sphere + slight scale variation)
function spawnFish(){
  const colors = [0xFF4500, 0xFFD700, 0x00FF7F, 0x1E90FF];
  const geo = new THREE.SphereGeometry(0.45 + Math.random()*0.35, 12, 12);
  const mat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random()*colors.length)], roughness: 0.7 });
  const fish = new THREE.Mesh(geo, mat);
  fish.castShadow = true;
  fish.position.set(Math.random()*60 - 30, 0.5 + Math.random()*0.6, Math.random()*60 - 30);
  // attach simple custom motion params
  fish.userData = {
    angle: Math.random()*Math.PI*2,
    radius: 6 + Math.random()*24,
    speed: 0.2 + Math.random()*0.6,
    heightOff: -0.2 + Math.random()*0.6,
    type: Math.floor(Math.random()*3) // 0 small,1 med,2 big
  };
  scene.add(fish);
  fishList.push(fish);
}

// cast button
document.getElementById("castButton").addEventListener("click", () => {
  if (fishing) return;
  fishing = true;
  statusText.innerText = "🎯 Đang chờ cá cắn câu...";
  try { soundCast.currentTime = 0; soundCast.play(); } catch(e){}
  // emulate wait -> 2-4s
  setTimeout(() => {
    // 60% chance to catch something; when caught +10 points
    if (Math.random() > 0.4) {
      statusText.innerText = "🐟 Bạn đã bắt được cá!";
      try { soundCatch.currentTime = 0; soundCatch.play(); } catch(e){}
      score += 10;
      scoreText.innerText = score;
    } else {
      statusText.innerText = "💨 Cá đã thoát mất...";
    }
    fishing = false;
  }, 1800 + Math.random()*2200);
});

// toggle day/night
document.getElementById("toggleDayNight").addEventListener("click", () => {
  if (isDay){
    scene.background = new THREE.Color("#000022");
  } else {
    scene.background = new THREE.Color("#87CEEB");
  }
  isDay = !isDay;
});

// resize handler
function onWindowResize(){
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// helper: update water positions (BufferGeometry)
let waterPos, basePositions = null;
function initWaterBuffers(){
  const posAttr = waterMesh.geometry.attributes.position;
  waterPos = posAttr.array; // Float32Array
  // copy base positions once
  basePositions = new Float32Array(waterPos.length);
  basePositions.set(waterPos);
}
function updateWater(time){
  if(!waterPos) initWaterBuffers();
  const pos = waterPos;
  // pos is flat [x,y,z,x,y,z,...]
  for(let i=0;i<pos.length;i+=3){
    const x = basePositions[i];
    const y = basePositions[i+1];
    const zbase = basePositions[i+2];
    // compute wave using x,z and time
    const wave = Math.sin((x*0.08) + time*0.9) * 0.22
               + Math.sin((y*0.09) - time*0.7) * 0.18
               + Math.sin((x*0.05 + y*0.04) + time*1.1) * 0.12;
    pos[i+2] = zbase + wave;
  }
  waterMesh.geometry.attributes.position.needsUpdate = true;
  // recompute normals for nicer lighting
  waterMesh.geometry.computeVertexNormals();
}

// animation loop
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // update water
  updateWater(t);

  // fish simple circular motion
  for(const fish of fishList){
    const d = fish.userData;
    d.angle += d.speed * 0.01;
    const x = Math.cos(d.angle) * d.radius;
    const z = Math.sin(d.angle) * d.radius;
    const y = 0.2 + d.heightOff + Math.sin(d.angle*2.0) * 0.06;
    fish.position.set(x, y, z);
    fish.lookAt(Math.cos(d.angle+0.2)*d.radius, y, Math.sin(d.angle+0.2)*d.radius);
  }

  controls.update();
  renderer.render(scene, camera);
}

// start
init();
