// WebGL Setup
const canvas = document.getElementById('liquid-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    console.error('WebGL not supported');
}

// Vertex Shader
const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

// Fragment Shader (SDF Business Symbols + Stars + Liquid Distortion)
const fragmentShaderSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_time;
    uniform float u_theme; // 0.0 for light, 1.0 for dark
    uniform float u_transition; // 0.0 to 1.0

    // Random function
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    // SDF for a Circle
    float sdCircle(vec2 p, float r) {
        return length(p) - r;
    }

    // SDF for a Box
    float sdBox(vec2 p, vec2 b) {
        vec2 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }

    // Rotate 2D
    mat2 rotate2d(float _angle){
        return mat2(cos(_angle),-sin(_angle),
                    sin(_angle),cos(_angle));
    }

    // Draw Business Symbols (Charts, Nodes)
    float businessPattern(vec2 uv, float time) {
        vec2 grid = fract(uv * 3.0) - 0.5;
        vec2 id = floor(uv * 3.0);
        
        float d = 1.0;
        
        // Randomly choose a shape for each grid cell
        float rnd = random(id);
        
        if (rnd < 0.3) {
            // Bar Chart
            float b1 = sdBox(grid - vec2(-0.2, -0.2), vec2(0.05, 0.2 + sin(time + rnd)*0.1));
            float b2 = sdBox(grid - vec2(0.0, -0.1), vec2(0.05, 0.3 + cos(time + rnd)*0.1));
            float b3 = sdBox(grid - vec2(0.2, 0.0), vec2(0.05, 0.4 + sin(time*0.5 + rnd)*0.1));
            d = min(min(b1, b2), b3);
        } else if (rnd < 0.6) {
            // Node connection
            float c1 = sdCircle(grid, 0.1);
            float l1 = sdBox(rotate2d(time * 0.5) * grid, vec2(0.3, 0.02));
            d = min(c1, l1);
        } else {
            // Pie chart ish
            float c = sdCircle(grid, 0.2);
            d = c;
        }
        
        return smoothstep(0.01, 0.0, d);
    }

    // Star Field
    float stars(vec2 uv) {
        float s = 0.0;
        for(float i=0.0; i<5.0; i++) {
            vec2 p = fract(uv * (10.0 + i*5.0)) - 0.5;
            float d = length(p);
            s += smoothstep(0.02, 0.0, d) * (0.5 + 0.5*sin(u_time + i));
        }
        return s;
    }

    void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        float aspect = u_resolution.x / u_resolution.y;
        vec2 uv = st;
        uv.x *= aspect;
        
        vec2 mouse = u_mouse;
        mouse.x *= aspect;

        // --- 1. Liquid Cursor (Distortion Only) ---
        float dist = distance(uv, mouse);
        
        // Lens/Zoom Distortion - Tighter radius to match DOM halo (approx 50px)
        float lensRadius = 0.06; 
        float lens = smoothstep(lensRadius, 0.0, dist);
        
        // Stronger pull for more "liquid" feel
        vec2 distortedUV = uv - (uv - mouse) * lens * 0.3; 
        
        // --- 2. Background ---
        // Base Colors
        vec3 lightBg = vec3(0.95, 0.97, 1.0);
        vec3 darkBg = vec3(0.02, 0.02, 0.05);
        
        vec3 bg = mix(lightBg, darkBg, u_theme);
        
        // Business Symbols (using distorted UVs for liquid effect)
        float symbols = businessPattern(distortedUV + vec2(u_time * 0.05, u_time * 0.02), u_time);
        vec3 symbolColor = mix(vec3(0.2, 0.4, 0.8), vec3(0.4, 0.6, 1.0), u_theme); // Blueish
        
        // Stars (Night only)
        float starField = stars(distortedUV);
        
        // Combine Background
        vec3 finalColor = bg;
        finalColor = mix(finalColor, symbolColor, symbols * 0.05); // Subtle symbols
        finalColor += vec3(1.0) * starField * u_theme * 0.5; // Stars only in dark mode
        
        // --- 3. Transition (Rainbow Flash) ---
        float shockwave = distance(uv, vec2(0.5 * aspect, 0.5));
        
        // Flash intensity from uniform (driven by JS/DOM timing)
        float flashIntensity = smoothstep(0.0, 0.2, u_transition) * smoothstep(1.0, 0.6, u_transition);
        
        // Add subtle rainbow fringe at edges of screen during flash
        float edgeDist = length(st - 0.5);
        vec3 rainbow = 0.5 + 0.5 * cos(u_time * 5.0 + uv.xyx + vec3(0,2,4));
        finalColor += rainbow * flashIntensity * edgeDist * 0.5;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// Compile Shader
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

// Create Program
const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

gl.useProgram(program);

// Buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const positions = [
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(positionAttributeLocation);
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

// Uniforms
const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
const timeLocation = gl.getUniformLocation(program, 'u_time');
const themeLocation = gl.getUniformLocation(program, 'u_theme');
const transitionLocation = gl.getUniformLocation(program, 'u_transition');

// State
let theme = 0; // 0 = light, 1 = dark
let transitionValue = 0;
let isTransitioning = false;

// Resize
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// Animation Loop
function render(time) {
    time *= 0.001; // seconds

    gl.uniform1f(timeLocation, time);
    gl.uniform1f(themeLocation, theme);
    gl.uniform1f(transitionLocation, transitionValue);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}
requestAnimationFrame(render);

// --- GSAP CURSOR LOGIC ---
const cursorHalo = document.getElementById('cursor-halo');
const clickableElements = document.querySelectorAll('a, button, .glass-card');

// Initial position
gsap.set(cursorHalo, { xPercent: -50, yPercent: -50 });

window.addEventListener('mousemove', (e) => {
    // Update WebGL mouse uniform
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = canvas.height - (e.clientY - rect.top); // Flip Y
    gl.uniform2f(mouseLocation, x, y);

    // Real-time follow using GSAP (very fast)
    gsap.to(cursorHalo, {
        duration: 0.02, // Almost instant
        x: e.clientX,
        y: e.clientY,
        ease: "none" // Linear for instant feel
    });
});

// Hover effects
clickableElements.forEach(el => {
    el.addEventListener('mouseenter', () => {
        gsap.to(cursorHalo, {
            width: 60,
            height: 60,
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            borderColor: getComputedStyle(document.body).getPropertyValue('--accent-color'),
            duration: 0.3
        });
    });

    el.addEventListener('mouseleave', () => {
        gsap.to(cursorHalo, {
            width: 40,
            height: 40,
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.4)",
            duration: 0.3
        });
    });
});

// UI Logic
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

themeToggle.addEventListener('click', () => {
    const isDark = body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        body.removeAttribute('data-theme');
        theme = 0.0;
    } else {
        body.setAttribute('data-theme', 'dark');
        theme = 1.0;
    }
});

// Page Transition Logic
const moreInfoBtn = document.getElementById('more-info-btn');
const backBtn = document.getElementById('back-btn');
const homeView = document.getElementById('home-view');
const infoView = document.getElementById('info-view');
const flashOverlay = document.getElementById('flash-overlay');

function triggerTransition(callback) {
    if (isTransitioning) return;
    isTransitioning = true;

    let startTime = performance.now();
    const duration = 1200;

    // DOM Flash Animation using GSAP
    gsap.to(flashOverlay, {
        opacity: 1,
        duration: 0.4,
        ease: "power2.in",
        onComplete: () => {
            // Switch Content
            callback();

            // Flash Out
            gsap.to(flashOverlay, {
                opacity: 0,
                duration: 0.8,
                ease: "power2.out",
                delay: 0.1
            });
        }
    });

    // WebGL Transition Value Animation
    function animateTransition(now) {
        let elapsed = now - startTime;
        let progress = Math.min(elapsed / duration, 1.0);

        transitionValue = Math.sin(progress * Math.PI);

        if (progress < 1.0) {
            requestAnimationFrame(animateTransition);
        } else {
            transitionValue = 0;
            isTransitioning = false;
        }
    }
    requestAnimationFrame(animateTransition);
}

moreInfoBtn.addEventListener('click', () => {
    triggerTransition(() => {
        homeView.classList.remove('active-view');
        homeView.style.display = 'none';

        infoView.style.display = 'block';
        requestAnimationFrame(() => {
            infoView.classList.add('active-view');
        });
    });
});

backBtn.addEventListener('click', () => {
    triggerTransition(() => {
        infoView.classList.remove('active-view');
        infoView.style.display = 'none';

        homeView.style.display = 'block';
        requestAnimationFrame(() => {
            homeView.classList.add('active-view');
        });
    });
});

// Video Modal Logic
const modal = document.getElementById('video-modal');
const modalFrame = document.getElementById('video-frame');
const closeModal = document.getElementById('close-modal');
const videoButtons = document.querySelectorAll('.video-link');

videoButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const src = btn.getAttribute('data-video-src');
        if (src) {
            modalFrame.src = src;
            modal.classList.add('active');
        }
    });
});

function hideModal() {
    modal.classList.remove('active');
    setTimeout(() => {
        modalFrame.src = '';
    }, 300);
}

closeModal.addEventListener('click', hideModal);

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        hideModal();
    }
});
