const isLocalPreview =
    window.location.protocol === "file:" ||
    ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
        window.location.port !== "" &&
        window.location.port !== "3000");
const backendOrigin = isLocalPreview ? "http://localhost:3000" : "";

const socket = io(backendOrigin || undefined);
const app = document.getElementById("app");
const labelsRoot = document.getElementById("labels");
const authStatus = document.getElementById("auth-status");
const lobbyStatus = document.getElementById("lobby-status");
const winnerName = document.getElementById("winner-name");
const googleSigninRoot = document.getElementById("google-signin");
const joinButton = document.getElementById("join-button");

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;
const ARENA_MAX_DISTANCE = 260;

let balls = [];
let rings = [];
let arenaCenter = new THREE.Vector2(400, 300);
let ballRadius = 10;
let authConfig = null;
let sessionToken = localStorage.getItem("lotterySessionToken") || "";
let signedInUser = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050816);
scene.fog = new THREE.Fog(0x050816, 500, 1200);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.display = "block";
app.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(
    -VIEW_WIDTH / 2,
    VIEW_WIDTH / 2,
    VIEW_HEIGHT / 2,
    -VIEW_HEIGHT / 2,
    0.1,
    2000
);
camera.position.set(0, 0, 620);
camera.lookAt(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0x6ac8ff, 1.2);
scene.add(ambientLight);

const keyLight = new THREE.PointLight(0x2cecff, 2.8, 900, 2);
keyLight.position.set(-180, 160, 320);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xff2f92, 2.2, 900, 2);
fillLight.position.set(220, -180, 280);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x7dffed, 1.5, 900, 2);
rimLight.position.set(0, 0, 420);
scene.add(rimLight);

const arenaGroup = new THREE.Group();
scene.add(arenaGroup);

const floorGeometry = new THREE.CircleGeometry(235, 96);
const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0x09122f,
    transparent: true,
    opacity: 0.78
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.position.z = -30;
arenaGroup.add(floor);

const gridGroup = new THREE.Group();
gridGroup.position.z = -28;
arenaGroup.add(gridGroup);

for (let i = -4; i <= 4; i++) {
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x1cf2ff,
        transparent: true,
        opacity: i === 0 ? 0.3 : 0.12
    });

    const horizontalPoints = [
        new THREE.Vector3(-220, i * 55, 0),
        new THREE.Vector3(220, i * 55, 0)
    ];
    const verticalPoints = [
        new THREE.Vector3(i * 55, -220, 0),
        new THREE.Vector3(i * 55, 220, 0)
    ];

    gridGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(horizontalPoints),
        lineMaterial
    ));
    gridGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(verticalPoints),
        lineMaterial.clone()
    ));
}

const ringMeshes = new Map();
const ballMeshes = new Map();

let sharedSphereGeometry = new THREE.SphereGeometry(ballRadius, 28, 28);

function setAuthStatus(message) {
    authStatus.textContent = message;
}

function setLobbyStatus(message) {
    lobbyStatus.textContent = message;
}

function setPreviousWinner(winner) {
    winnerName.textContent = winner?.name || "No winner yet";
}

function updateJoinButton() {
    joinButton.disabled = !sessionToken;
}

function setSignedInUser(user, token) {
    signedInUser = user;
    sessionToken = token;

    if (sessionToken) {
        localStorage.setItem("lotterySessionToken", sessionToken);
    } else {
        localStorage.removeItem("lotterySessionToken");
    }

    if (signedInUser) {
        setAuthStatus(`Signed in as ${signedInUser.name}`);
    } else if (authConfig?.googleEnabled) {
        setAuthStatus("Sign in with Google to join this round.");
    } else {
        setAuthStatus("Set GOOGLE_CLIENT_ID on the backend to enable sign-in.");
    }

    updateJoinButton();
}

function setBallRadius(radius) {
    if (!radius || radius === ballRadius) {
        return;
    }

    ballRadius = radius;
    sharedSphereGeometry.dispose();
    sharedSphereGeometry = new THREE.SphereGeometry(ballRadius, 28, 28);

    ballMeshes.forEach((visual) => {
        visual.sphere.geometry = sharedSphereGeometry;
    });
}

async function loadConfig() {
    const response = await fetch(`${backendOrigin}/api/config`);
    if (!response.ok) {
        throw new Error("Failed to load app config");
    }

    authConfig = await response.json();
}

async function exchangeGoogleCredential(credential) {
    const response = await fetch(`${backendOrigin}/api/auth/google`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ credential })
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Google sign-in failed");
    }

    return data;
}

async function handleGoogleCredentialResponse(response) {
    setAuthStatus("Verifying Google sign-in…");

    try {
        const data = await exchangeGoogleCredential(response.credential);
        setSignedInUser(data.user, data.sessionToken);
    } catch (error) {
        setSignedInUser(null, "");
        setAuthStatus(error.message);
    }
}

function initGoogleSignIn() {
    if (!authConfig?.googleEnabled) {
        setSignedInUser(null, "");
        return;
    }

    if (!window.google?.accounts?.id) {
        setAuthStatus("Google sign-in library did not load.");
        return;
    }

    window.google.accounts.id.initialize({
        client_id: authConfig.googleClientId,
        callback: handleGoogleCredentialResponse
    });

    window.google.accounts.id.renderButton(googleSigninRoot, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 300
    });

    if (!sessionToken) {
        setSignedInUser(null, "");
    } else {
        setAuthStatus("Signed in. You can join the current round.");
        updateJoinButton();
    }
}

function waitForGoogleLibrary(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();

        function check() {
            if (window.google?.accounts?.id) {
                resolve();
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error("Google sign-in library did not load."));
                return;
            }

            window.setTimeout(check, 100);
        }

        check();
    });
}

function worldFromState(x, y) {
    return {
        x: x - (VIEW_WIDTH / 2),
        y: (VIEW_HEIGHT / 2) - y
    };
}

function createGlowTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");

    const gradient = context.createRadialGradient(
        size / 2,
        size / 2,
        10,
        size / 2,
        size / 2,
        size / 2
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.24, "rgba(120,245,255,0.9)");
    gradient.addColorStop(0.5, "rgba(40,220,255,0.35)");
    gradient.addColorStop(1, "rgba(40,220,255,0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

const glowTexture = createGlowTexture();

function polarToWorld(radius, angle) {
    return new THREE.Vector2(
        Math.cos(angle) * radius,
        -Math.sin(angle) * radius
    );
}

function createRingArcGeometry(ring, depth) {
    const outerRadius = ring.radius + (ring.thickness / 2);
    const innerRadius = ring.radius - (ring.thickness / 2);
    const startAngle = ring.gapStart + ring.gapAngle;
    const endAngle = ring.gapStart + (Math.PI * 2);
    const steps = Math.max(96, Math.ceil(ring.radius * ((Math.PI * 2) - ring.gapAngle) / 4));
    const shape = new THREE.Shape();

    const firstOuterPoint = polarToWorld(outerRadius, startAngle);
    shape.moveTo(firstOuterPoint.x, firstOuterPoint.y);

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + ((endAngle - startAngle) * t);
        const point = polarToWorld(outerRadius, angle);
        shape.lineTo(point.x, point.y);
    }

    for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const angle = startAngle + ((endAngle - startAngle) * t);
        const point = polarToWorld(innerRadius, angle);
        shape.lineTo(point.x, point.y);
    }

    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: steps
    });

    geometry.center();
    return geometry;
}

function disposeRingMesh(mesh) {
    arenaGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();

    if (mesh.children[0]) {
        mesh.children[0].geometry.dispose();
        mesh.children[0].material.dispose();
    }
}

function createRingMesh(ring, index) {
    const visibleThickness = ring.colliderThickness || ring.thickness;
    const ringDepth = 8;
    const geometry = createRingArcGeometry(
        { ...ring, thickness: visibleThickness },
        ringDepth
    );

    const colorPalette = [0x2cf7ff, 0xff3ca6, 0xb2ff43];
    const emissivePalette = [0x19ccff, 0xf70084, 0x7cff00];
    const material = new THREE.MeshStandardMaterial({
        color: colorPalette[index % colorPalette.length],
        emissive: emissivePalette[index % emissivePalette.length],
        emissiveIntensity: 1.8,
        metalness: 0.12,
        roughness: 0.24
    });

    const mesh = new THREE.Mesh(geometry, material);
    const center = worldFromState(ring.x, ring.y);
    mesh.position.set(center.x, center.y, 0);
    mesh.rotation.z = -ring.rotation;
    mesh.userData.shapeSignature = [
        ring.x,
        ring.y,
        ring.radius,
        visibleThickness,
        ring.gapAngle,
        ring.gapStart
    ].join(":");

    const halo = new THREE.Mesh(
        geometry.clone(),
        new THREE.MeshBasicMaterial({
            color: colorPalette[index % colorPalette.length],
            transparent: true,
            opacity: 0.1
        })
    );
    halo.scale.setScalar(1.02);
    mesh.add(halo);

    arenaGroup.add(mesh);
    ringMeshes.set(ring.id, mesh);
}

function syncRings() {
    if (rings[0]) {
        arenaCenter.set(rings[0].x, rings[0].y);
        const center = worldFromState(arenaCenter.x, arenaCenter.y);
        floor.position.set(center.x, center.y, -30);
        gridGroup.position.set(center.x, center.y, -28);
    }

    rings.forEach((ring, index) => {
        const visibleThickness = ring.colliderThickness || ring.thickness;
        const shapeSignature = [
            ring.x,
            ring.y,
            ring.radius,
            visibleThickness,
            ring.gapAngle,
            ring.gapStart
        ].join(":");

        if (!ringMeshes.has(ring.id)) {
            createRingMesh(ring, index);
        }

        let mesh = ringMeshes.get(ring.id);

        if (mesh.userData.shapeSignature !== shapeSignature) {
            disposeRingMesh(mesh);
            ringMeshes.delete(ring.id);
            createRingMesh(ring, index);
            mesh = ringMeshes.get(ring.id);
        }

        const center = worldFromState(ring.x, ring.y);
        mesh.position.set(center.x, center.y, 0);
        mesh.rotation.z = -ring.rotation;
    });

    const activeRingIds = new Set(rings.map((ring) => ring.id));

    Array.from(ringMeshes.entries()).forEach(([ringId, mesh]) => {
        if (activeRingIds.has(ringId)) {
            return;
        }

        disposeRingMesh(mesh);
        ringMeshes.delete(ringId);
    });
}

function createBallVisual(ball) {
    const color = new THREE.Color().setHSL(Math.random(), 0.85, 0.58);
    const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.65),
        emissiveIntensity: 1.2,
        metalness: 0.08,
        roughness: 0.18
    });

    const sphere = new THREE.Mesh(sharedSphereGeometry, material);
    sphere.castShadow = false;
    sphere.receiveShadow = true;

    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.75
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(42, 42, 1);
    sphere.add(glow);

    const light = new THREE.PointLight(color, 1.2, 180, 2);
    light.position.z = 14;
    sphere.add(light);

    arenaGroup.add(sphere);

    const label = document.createElement("div");
    label.className = "ball-label";
    label.textContent = ball.name;
    labelsRoot.appendChild(label);

    ballMeshes.set(ball.name, { sphere, glow, light, label, current: { x: 0, y: 0 } });
}

function syncBalls() {
    const activeNames = new Set();

    balls.forEach((ball) => {
        activeNames.add(ball.name);

        if (!ballMeshes.has(ball.name)) {
            createBallVisual(ball);
        }

        const visual = ballMeshes.get(ball.name);
        const position = worldFromState(ball.x, ball.y);
        const distance = arenaCenter.distanceTo(new THREE.Vector2(ball.x, ball.y));
        const distanceRatio = THREE.MathUtils.clamp(distance / ARENA_MAX_DISTANCE, 0, 1);
        const glowStrength = 1.1 + (distanceRatio * 2.6);

        visual.current.x = position.x;
        visual.current.y = position.y;

        visual.sphere.position.set(position.x, position.y, 8 + (distanceRatio * 8));
        visual.sphere.scale.setScalar(1 + distanceRatio * 0.05);
        visual.sphere.material.emissiveIntensity = glowStrength;

        const hueShift = 0.5 + (distanceRatio * 0.18);
        visual.sphere.material.emissive.setHSL(hueShift, 1, 0.5);

        visual.glow.material.opacity = 0.45 + (distanceRatio * 0.55);
        visual.glow.scale.setScalar(34 + (distanceRatio * 48));

        visual.light.intensity = 0.8 + (distanceRatio * 3);
        visual.light.distance = 120 + (distanceRatio * 180);
    });

    Array.from(ballMeshes.entries()).forEach(([name, visual]) => {
        if (activeNames.has(name)) {
            return;
        }

        arenaGroup.remove(visual.sphere);
        visual.sphere.material.dispose();
        visual.glow.material.dispose();
        visual.label.remove();
        ballMeshes.delete(name);
    });
}

socket.on("state", (state) => {
    balls = state.balls;
    rings = state.rings || [];
    setBallRadius(state.ballRadius);

    syncRings();
    syncBalls();
});

socket.on("lobby_state", (state) => {
    setPreviousWinner(state.previousWinner);

    if (state.running) {
        setLobbyStatus("Round in progress.");
        return;
    }

    if (state.playersJoined === 0) {
        setLobbyStatus("Waiting for players to join.");
        return;
    }

    if (state.playersNeeded > 0) {
        setLobbyStatus(`Waiting for ${state.playersNeeded} more player${state.playersNeeded === 1 ? "" : "s"} to start.`);
        return;
    }

    setLobbyStatus("Starting round…");
});

socket.on("winner", (winner) => {
    setPreviousWinner(winner);
    setAuthStatus(`${winner.name} won the last round. Joined players stay queued for the next one.`);
});

joinButton.addEventListener("click", () => {
    if (!sessionToken) {
        setAuthStatus("Sign in with Google first.");
        return;
    }

    joinButton.disabled = true;
    setAuthStatus(signedInUser
        ? `Joining round as ${signedInUser.name}…`
        : "Joining round…");

    socket.emit("join_game", { sessionToken }, (result) => {
        if (result?.ok) {
            setAuthStatus(
                result.alreadyJoined
                    ? (result.message || "You are already queued for upcoming rounds.")
                    : `Joined round as ${signedInUser?.name || "your Google account"}.`
            );
        } else {
            setAuthStatus(result?.error || "Unable to join the round.");
        }

        updateJoinButton();
    });
});

function updateLabels() {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;

    ballMeshes.forEach((visual) => {
        const worldPosition = new THREE.Vector3();
        visual.sphere.getWorldPosition(worldPosition);
        worldPosition.project(camera);

        const screenX = ((worldPosition.x + 1) / 2) * width;
        const screenY = ((1 - worldPosition.y) / 2) * height;

        visual.label.style.left = `${screenX}px`;
        visual.label.style.top = `${screenY - 20}px`;
    });
}

function resizeRenderer() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);

    const aspect = width / height;
    const baseHeight = VIEW_HEIGHT;
    const baseWidth = baseHeight * aspect;

    camera.left = -baseWidth / 2;
    camera.right = baseWidth / 2;
    camera.top = baseHeight / 2;
    camera.bottom = -baseHeight / 2;
    camera.updateProjectionMatrix();
}

window.addEventListener("resize", resizeRenderer);
resizeRenderer();

const clock = new THREE.Clock();

function animate() {
    const elapsed = clock.getElapsedTime();

    arenaGroup.rotation.x = -0.02;
    arenaGroup.rotation.y = 0;
    arenaGroup.position.y = 0;

    floor.material.opacity = 0.65 + Math.sin(elapsed * 0.7) * 0.05;
    keyLight.position.x = -180 + Math.sin(elapsed * 0.55) * 60;
    fillLight.position.y = -180 + Math.cos(elapsed * 0.42) * 40;

    renderer.render(scene, camera);
    updateLabels();
    requestAnimationFrame(animate);
}

animate();

loadConfig()
    .then(waitForGoogleLibrary)
    .then(initGoogleSignIn)
    .catch((error) => {
        if (isLocalPreview) {
            setAuthStatus("Open the app at http://localhost:3000 so Google sign-in can initialize.");
            return;
        }

        setAuthStatus(error.message);
    });
