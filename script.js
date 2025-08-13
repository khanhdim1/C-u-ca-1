let scene, camera, renderer, controls;
let water, rod;
let fishList = [];
let fishing = false;
let score = 0;
let isDay = true;

let statusText = document.getElementById("status");
let scoreText = document.getElementById("score");

// Âm thanh
const soundCatch = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_5e1a8d9f62.mp3?filename=success-1-6297.mp3");
const soundCast = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_4e2f0a7fcd.mp3?filename=throw-wood-stick-5.mp3");

// Khởi tạo game
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#87CEEB");

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 10, 25);

    // Renderer Ultra Graphics
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById("game-container").appendChild(renderer.domElement);

    // Điều khiển camera
    controls = new THREE.OrbitControls(camera, renderer.domElement);

    // Ánh sáng ban ngày
    const sunlight = new THREE.DirectionalLight(0xffffff, 1);
    sunlight.position.set(10, 20, 10);
    sunlight.castShadow = true;
    scene.add(sunlight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // Mặt nước động
    const waterGeo = new THREE.PlaneGeometry(200, 200, 32, 32);
    const waterMat = new THREE.MeshPhongMaterial({ color: 0x1E90FF, shininess: 100, side: THREE.DoubleSide, flatShading: false });
    water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    // Cần câu
    const rodGeo = new THREE.CylinderGeometry(0.1, 0.1, 10);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    rod = new THREE.Mesh(rodGeo, rodMat);
    rod.position.set(0, 5, 0);
    rod.castShadow = true;
    scene.add(rod);

    // Tạo nhiều loại cá
    for (let i = 0; i < 10; i++) {
        spawnFish();
    }

    window.addEventListener("resize", onWindowResize);
    animate();
}

// Tạo cá
function spawnFish() {
    const colors = [0xFF4500, 0xFFD700, 0x00FF7F, 0x1E90FF];
    const fishGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const fishMat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
    const fish = new THREE.Mesh(fishGeo, fishMat);
    fish.position.set(Math.random() * 50 - 25, 0.5, Math.random() * 50 - 25);
    fish.castShadow = true;
    fishList.push(fish);
    scene.add(fish);
}

// Nút quăng cần câu
document.getElementById("castButton").addEventListener("click", () => {
    if (fishing) return;
    fishing = true;
    statusText.innerText = "🎯 Đang chờ cá cắn câu...";
    soundCast.play();
    setTimeout(() => {
        if (Math.random() > 0.4) {
            statusText.innerText = "🐟 Bạn đã bắt được cá!";
            soundCatch.play();
            score += 10;
            scoreText.innerText = score;
        } else {
            statusText.innerText = "💨 Cá đã thoát mất...";
        }
        fishing = false;
    }, 2000 + Math.random() * 3000);
});

// Chuyển ngày / đêm
document.getElementById("toggleDayNight").addEventListener("click", () => {
    if (isDay) {
        scene.background = new THREE.Color("#000022");
    } else {
        scene.background = new THREE.Color("#87CEEB");
    }
    isDay = !isDay;
});

// Xử lý kích thước
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Vòng lặp game
function animate() {
    requestAnimationFrame(animate);

    // Tạo sóng nước động
    water.geometry.vertices.forEach(v => {
        v.z = Math.sin(v.x * 0.1 + Date.now() * 0.001) * 0.2;
    });
    water.geometry.verticesNeedUpdate = true;

    // Cá bơi
    fishList.forEach(fish => {
        fish.position.x += (Math.random() - 0.5) * 0.05;
        fish.position.z += (Math.random() - 0.5) * 0.05;
    });

    controls.update();
    renderer.render(scene, camera);
}

init();
