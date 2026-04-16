const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwRQ3WhDiNLYHvd5TzaTE3w8ogenhbow4CAITQ8duCMcq1Xc5XczJhzzQK5W3T5D6eaqA/exec"; // PASTE YOUR URL HERE
let loggedInUser = "";
let EXAM_DURATION = 180 * 60; // Default, will be overwritten by Google Sheets

const STATUS = { NOT_VISITED: 'not-visited', NOT_ANSWERED: 'not-answered', ANSWERED: 'answered', MARKED: 'marked', ANSWERED_MARKED: 'answered-marked' };

// Added 'escapeCount' to track fullscreen exits
let state = {
    questions: [], sections: [], currentSection: '', currentIndex: 0,
    answers: {}, statuses: {}, timeLeft: EXAM_DURATION, timerInterval: null,
    escapeCount: 0 
};

document.addEventListener("DOMContentLoaded", () => {
    initPortalCanvas('portal-canvas');
    fetchQuestionBank(); 
    
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-next').addEventListener('click', () => navigate(true, true));
    document.getElementById('btn-prev').addEventListener('click', () => navigate(false, false));
    document.getElementById('btn-mark').addEventListener('click', markForReview);
    document.getElementById('btn-clear').addEventListener('click', clearResponse);
    document.getElementById('btn-submit-exam').addEventListener('click', confirmSubmit);
    
    document.getElementById('link-show-request').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-box').style.display = 'none'; document.getElementById('request-box').style.display = 'block'; });
    document.getElementById('btn-cancel-request').addEventListener('click', () => { document.getElementById('request-box').style.display = 'none'; document.getElementById('login-box').style.display = 'block'; });
    document.getElementById('btn-send-request').addEventListener('click', handleAccessRequest);

    const logoutBtn = document.getElementById('btn-student-logout');
    if(logoutBtn) logoutBtn.addEventListener('click', () => { location.reload(); });

    // --- FULL SCREEN ANTI-CHEAT LISTENERS ---
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    // --- FULLSCREEN MODAL BUTTON LISTENERS ---
    
    // Button 1: Go Full Screen
    document.getElementById('btn-return-fullscreen').addEventListener('click', async () => {
        try {
            const elem = document.documentElement;
            // Cross-browser full screen requests
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                await elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) { /* IE11 */
                await elem.msRequestFullscreen();
            }
            // Only hide the modal if the browser successfully entered full screen
            document.getElementById('fullscreen-warning-modal').style.display = 'none';
        } catch(e) {
            console.error("Fullscreen request failed", e);
            alert("Your browser blocked full screen. Please click 'Go Full Screen' again.");
        }
    });

    // Button 2: Submit Exam
    document.getElementById('btn-force-submit').addEventListener('click', () => {
        document.getElementById('fullscreen-warning-modal').style.display = 'none';
        autoSubmit(); // Instantly grade and submit
    });
});

// ==========================================
// ANTI-CHEAT FULLSCREEN LOGIC
// ==========================================
function handleFullscreenChange() {
    // Only trigger if the exam is currently active
    if (document.getElementById('exam-screen').classList.contains('active')) {
        
        // Cross-browser check to see if we are OUT of full screen
        if (!document.fullscreenElement && !document.webkitIsFullScreen && !document.mozFullScreenElement && !document.msFullscreenElement) {
            
            state.escapeCount = (state.escapeCount || 0) + 1;
            saveState(); // Save immediately so they can't bypass by refreshing

            if (state.escapeCount >= 3) {
                // Strike 3: Auto-submit directly.
                document.getElementById('fullscreen-warning-modal').style.display = 'none';
                alert("EXAM AUTO-SUBMITTED: You have tried to escape full screen mode 3 times.");
                autoSubmit();
            } else {
                // Strike 1 & 2: Show the enforcement modal (NO native alerts!)
                const msgText = `WARNING (${state.escapeCount}/3): You have exited full-screen mode!\n\nKindly go fullscreen or else you will not be able to resume the test.`;
                document.getElementById('warning-msg-text').innerText = msgText;
                document.getElementById('fullscreen-warning-modal').style.display = 'flex';
            }
        }
    }
}

// ==========================================
// DATA FETCHING (Includes Settings & Title)
// ==========================================
async function fetchQuestionBank() {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const data = await response.json();
        
        if (data.success && data.data.length > 0) {
            
            // Apply Settings from Google Sheets
            if (data.settings) {
                // 1. Dynamic Timer
                if (data.settings.TimerMinutes) {
                    EXAM_DURATION = parseInt(data.settings.TimerMinutes) * 60;
                    if (!localStorage.getItem('mockExamState')) state.timeLeft = EXAM_DURATION;
                }
                
                // 2. Dynamic Exam Title
                if (data.settings.ExamTitle) {
                    const titleText = data.settings.ExamTitle;
                    document.title = titleText; // Updates the browser tab text
                    
                    const portalTitle = document.getElementById('portal-main-title');
                    const examTitle = document.getElementById('exam-main-title');
                    
                    if (portalTitle) portalTitle.innerText = titleText;
                    if (examTitle) examTitle.innerText = titleText;
                }
            }

            state.questions = data.data;
            state.sections = [...new Set(state.questions.map(q => q.Section).filter(Boolean))];
            state.currentSection = state.sections[0];
            
            state.questions.forEach(q => { if (!state.statuses[q.QID]) state.statuses[q.QID] = STATUS.NOT_VISITED; });
            
            document.getElementById('display-sections').innerText = state.sections.length;
            document.getElementById('display-total-q').innerText = state.questions.length;
            document.getElementById('global-loader').style.display = 'none';
            document.getElementById('auth-container').style.display = 'block';
            
            checkResumeState();
        } else {
            document.getElementById('global-loader').innerHTML = "<h3 class='gradient-text-light' style='color:red;'>Error loading questions. Admin: Check Google Sheet.</h3>";
        }
    } catch (error) {
        document.getElementById('global-loader').innerHTML = "<h3 class='gradient-text-light' style='color:red;'>Network error. Please refresh the page.</h3>";
    }
}

function checkResumeState() {
    const saved = localStorage.getItem('mockExamState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.questions && parsed.questions.length === state.questions.length) {
                state.answers = parsed.answers;
                state.statuses = parsed.statuses;
                state.timeLeft = parsed.timeLeft;
                state.escapeCount = parsed.escapeCount || 0;
            }
        } catch (e) { console.error("Failed to parse saved state"); }
    }
}

function saveState() {
    localStorage.setItem('mockExamState', JSON.stringify(state));
}

// ==========================================
// LOGIN & REQUEST LOGIC
// ==========================================
async function handleLogin() {
    const userId = document.getElementById('login-id').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const statusText = document.getElementById('login-status');
    
    if (!userId || !pass) { statusText.innerText = "Please enter both ID and Password."; return; }
    
    statusText.style.color = "#0056b3"; statusText.innerText = "Authenticating...";
    document.getElementById('btn-login').disabled = true;

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "login", userId: userId, password: pass }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        const data = await response.json();
        
        if (data.success) {
            loggedInUser = userId;
            startExam(); 
        } else {
            statusText.style.color = "red"; statusText.innerText = data.message;
            document.getElementById('btn-login').disabled = false;
        }
    } catch (e) {
        statusText.style.color = "red"; statusText.innerText = "Network error.";
        document.getElementById('btn-login').disabled = false;
    }
}

async function handleAccessRequest() {
    const name = document.getElementById('req-name').value.trim();
    const email = document.getElementById('req-email').value.trim();
    const statusText = document.getElementById('request-status');
    const btn = document.getElementById('btn-send-request');
    
    if (!name || !email) { statusText.style.color = "red"; statusText.innerText = "Please enter both name and email."; return; }
    
    statusText.style.color = "#0056b3"; statusText.innerText = "Sending request..."; btn.disabled = true;

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "requestAccess", name: name, email: email }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        const data = await response.json();
        if (data.success) {
            statusText.style.color = "green"; statusText.innerText = "Request sent! Check your email soon.";
            document.getElementById('req-name').value = ''; document.getElementById('req-email').value = '';
        } else {
            statusText.style.color = "red"; statusText.innerText = data.message || "Failed to send request.";
        }
    } catch (e) {
        statusText.style.color = "red"; statusText.innerText = "Network error.";
    }
    btn.disabled = false;
}

// ==========================================
// EXAM FLOW & TIMER
// ==========================================
function startExam() {
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch(e) {}
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('exam-screen').classList.add('active');
    
    const nameEl = document.querySelector('.user-info div:nth-child(2)');
    if (nameEl) nameEl.innerText = `Candidate: ${loggedInUser}`;
    
    startTimer();
    renderSectionNav();
    loadQuestion(0, state.currentSection);
}

function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    const timerDisplay = document.getElementById('timer-display');
    state.timerInterval = setInterval(() => {
        if (state.timeLeft <= 0) { clearInterval(state.timerInterval); autoSubmit(); return; }
        state.timeLeft--;
        const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
        const s = (state.timeLeft % 60).toString().padStart(2, '0');
        timerDisplay.innerText = `Time Left: ${m}:${s}`;
        if (state.timeLeft % 30 === 0) saveState(); 
    }, 1000);
}

// ==========================================
// DYNAMIC UI RENDERING
// ==========================================
function renderSectionNav() {
    const nav = document.getElementById('section-nav');
    nav.innerHTML = '';
    state.sections.forEach(sec => {
        const div = document.createElement('div');
        div.className = `section-tab ${sec === state.currentSection ? 'active' : ''}`;
        div.innerText = sec;
        div.onclick = () => switchSection(sec);
        nav.appendChild(div);
    });
}

function switchSection(sectionName) {
    state.currentSection = sectionName;
    renderSectionNav();
    document.getElementById('palette-section-title').innerText = sectionName;
    loadQuestion(0, sectionName); 
}

function loadQuestion(index, section) {
    const sectionQs = state.questions.filter(q => q.Section === section);
    if (index < 0 || index >= sectionQs.length) return;
    
    state.currentIndex = index;
    const q = sectionQs[index];
    
    if (state.statuses[q.QID] === STATUS.NOT_VISITED) state.statuses[q.QID] = STATUS.NOT_ANSWERED;

    document.getElementById('current-q-num').innerText = `Question ${index + 1}`;
    
    let qHTML = (q.Question || "").replace(/\n/g, '<br>');
    
    if (q.ImageURL && q.ImageURL.trim() !== "") {
        let finalImageUrl = q.ImageURL.trim();
        
        // Match the Google Drive URL and extract the ID
        const driveRegex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
        const match = finalImageUrl.match(driveRegex);
        
        if (match && match[1]) {
            const fileId = match[1];
            // Use Google's Thumbnail API (sz=w1000 forces a high-quality 1000px width)
            finalImageUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
        }
        
        // We add an 'onerror' fallback. If Google blocks the image, it shows a helpful error box instead of a broken icon.
        qHTML += `<br><img src="${finalImageUrl}" alt="Question Image" style="max-width:100%; margin-top:15px; border-radius:5px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" onerror="this.onerror=null; this.src='https://placehold.co/600x200/fee2e2/991b1b?text=Image+Blocked+by+Google+Drive';">`;
    }
    
    document.getElementById('question-text').innerHTML = qHTML;

    const optContainer = document.getElementById('options-container');
    optContainer.innerHTML = '';
    
    const optionKeys = Object.keys(q).filter(k => k.startsWith('Option') && q[k].trim() !== '');
    optionKeys.forEach(optKey => {
        const optLetter = optKey.replace('Option', '').trim();
        const optVal = q[optKey];
        const label = document.createElement('label');
        label.className = 'option-label';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'option'; radio.value = optLetter;
        if (state.answers[q.QID] === optLetter) radio.checked = true;
        radio.addEventListener('change', (e) => { state.answers[q.QID] = e.target.value; });
        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${optLetter}. ${optVal}`));
        optContainer.appendChild(label);
    });

    if (window.MathJax) MathJax.typesetPromise([document.getElementById('question-text'), document.getElementById('options-container')]);
    renderPalette(); saveState();
}

function renderPalette() {
    const sectionQs = state.questions.filter(q => q.Section === state.currentSection);
    const palette = document.getElementById('question-palette');
    palette.innerHTML = '';
    const counts = { [STATUS.NOT_VISITED]:0, [STATUS.NOT_ANSWERED]:0, [STATUS.ANSWERED]:0, [STATUS.MARKED]:0, [STATUS.ANSWERED_MARKED]:0 };

    sectionQs.forEach((q, idx) => {
        const btn = document.createElement('button');
        const s = state.statuses[q.QID];
        counts[s]++;
        btn.className = `palette-btn ${s}`;
        btn.innerText = idx + 1;
        btn.onclick = () => loadQuestion(idx, state.currentSection);
        if (idx === state.currentIndex) btn.style.border = "2px solid #000";
        palette.appendChild(btn);
    });

    document.querySelector('.status-legend .not-visited').innerText = counts[STATUS.NOT_VISITED];
    document.querySelector('.status-legend .not-answered').innerText = counts[STATUS.NOT_ANSWERED];
    document.querySelector('.status-legend .answered').innerText = counts[STATUS.ANSWERED];
    document.querySelector('.status-legend .marked').innerText = counts[STATUS.MARKED];
    document.querySelector('.status-legend .answered-marked').innerText = counts[STATUS.ANSWERED_MARKED];
}

function getCurrentQ() { return state.questions.filter(q => q.Section === state.currentSection)[state.currentIndex]; }

// ==========================================
// UPDATED NAVIGATION (SECTION JUMPING)
// ==========================================
function navigate(forward, save) {
    const q = getCurrentQ();
    
    // Save response logic
    if (save) {
        const selected = document.querySelector('input[name="option"]:checked');
        if (selected) {
            state.answers[q.QID] = selected.value;
            state.statuses[q.QID] = (state.statuses[q.QID] === STATUS.MARKED || state.statuses[q.QID] === STATUS.ANSWERED_MARKED) ? STATUS.ANSWERED_MARKED : STATUS.ANSWERED;
        } else if (state.statuses[q.QID] !== STATUS.MARKED && state.statuses[q.QID] !== STATUS.ANSWERED_MARKED) {
            state.statuses[q.QID] = STATUS.NOT_ANSWERED;
        }
    }

    const sectionQs = state.questions.filter(qu => qu.Section === state.currentSection);
    
    if (forward) {
        if (state.currentIndex < sectionQs.length - 1) {
            // Normal: Move to next question in current section
            loadQuestion(state.currentIndex + 1, state.currentSection);
        } else {
            // Reached the end of the current section
            const currentSectionIndex = state.sections.indexOf(state.currentSection);
            if (currentSectionIndex < state.sections.length - 1) {
                // JUMP to next section automatically
                switchSection(state.sections[currentSectionIndex + 1]);
            } else {
                // Last question of the LAST section: Do nothing except save
                renderPalette();
                saveState();
            }
        }
    } else {
        // Going backwards
        if (state.currentIndex > 0) {
            loadQuestion(state.currentIndex - 1, state.currentSection);
        } else {
            renderPalette(); saveState(); 
        }
    }
}

function markForReview() {
    const q = getCurrentQ();
    const selected = document.querySelector('input[name="option"]:checked');
    if (selected) {
        state.answers[q.QID] = selected.value;
        state.statuses[q.QID] = STATUS.ANSWERED_MARKED;
    } else {
        state.statuses[q.QID] = STATUS.MARKED;
    }
    navigate(true, false); 
}

function clearResponse() {
    const q = getCurrentQ();
    delete state.answers[q.QID];
    state.statuses[q.QID] = STATUS.NOT_ANSWERED;
    const options = document.querySelectorAll('input[name="option"]');
    options.forEach(opt => opt.checked = false);
    renderPalette(); saveState();
}

// ==========================================
// SUBMISSION
// ==========================================
function confirmSubmit() { if (confirm("Submit exam? You cannot change answers after submission.")) autoSubmit(); }

async function autoSubmit() {
    clearInterval(state.timerInterval);
    try { if (document.exitFullscreen) document.exitFullscreen(); } catch(e){}

    document.getElementById('exam-screen').classList.remove('active');
    document.getElementById('result-screen').classList.add('active');
    initPortalCanvas('result-canvas'); // Start animation on result screen
    
    const resultsDiv = document.getElementById('score-summary');
    resultsDiv.style.display = "block";
    resultsDiv.innerHTML = "<h3 class='gradient-text-light'>Submitting securely... Please wait.</h3>";

    let correct = 0, incorrect = 0, unattempted = 0;
    state.questions.forEach(q => {
        const ans = state.answers[q.QID];
        if (!ans) unattempted++;
        else if (ans.toUpperCase() === q.Answer.toUpperCase()) correct++;
        else incorrect++;
    });
    const marks = (correct * 4) - (incorrect * 1);

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "submit", userId: loggedInUser || "Unknown", score: marks, correct: correct, incorrect: incorrect, timeRemaining: state.timeLeft }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        resultsDiv.innerHTML = `
            <h3 class="gradient-text-light" style="font-size: 28px;">Total Score: ${marks}</h3>
            <p style="color: #64748b; margin-bottom: 15px;">Your results have been successfully recorded.</p>
            <p><strong>Correct:</strong> ${correct} &nbsp;|&nbsp; <strong>Incorrect:</strong> ${incorrect} &nbsp;|&nbsp; <strong>Unattempted:</strong> ${unattempted}</p>
        `;
        localStorage.removeItem('mockExamState'); 
    } catch (error) {
        resultsDiv.innerHTML = `<h3 style="color: red;">Submission Error</h3><p>Network error submitting exam. Take a screenshot.</p><p><strong>Score: ${marks}</strong></p>`;
    }
}
// ==========================================
// CHEMISTRY BACKGROUND ANIMATION
// ==========================================
function initPortalCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width, height, particles;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    // Draws a true Benzene ring with a delocalized inner circle
    function drawBenzene(x, y, size, rotation, opacity) {
        ctx.strokeStyle = `rgba(0, 86, 179, ${opacity})`;
        ctx.lineWidth = 1.5;
        
        // Draw the outer hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = rotation + (Math.PI / 3) * i;
            const hx = x + size * Math.cos(angle);
            const hy = y + size * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw the inner circle (representing alternating double bonds / delocalized ring)
        ctx.beginPath();
        ctx.arc(x, y, size * 0.65, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw atoms at the vertices
        for (let i = 0; i < 6; i++) {
            const angle = rotation + (Math.PI / 3) * i;
            const hx = x + size * Math.cos(angle);
            const hy = y + size * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(hx, hy, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 86, 179, ${opacity + 0.2})`;
            ctx.fill();
        }
    }

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.3; // Gentle drift
            this.vy = (Math.random() - 0.5) * 0.3;
            this.radius = Math.random() * 3 + 1.5; 
            
            // 15% chance to be a Benzene ring
            this.isBenzene = Math.random() > 0.85; 
            this.hexSize = Math.random() * 15 + 20; // Slightly larger for detail
            
            // Allow rings to slowly rotate
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.01;
        }
        update() {
            this.x += this.vx; 
            this.y += this.vy;
            this.rotation += this.rotationSpeed;
            
            if (this.x < -50 || this.x > width + 50) this.vx = -this.vx;
            if (this.y < -50 || this.y > height + 50) this.vy = -this.vy;
        }
        draw() {
            if (this.isBenzene) {
                drawBenzene(this.x, this.y, this.hexSize, this.rotation, 0.2);
            } else {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 86, 179, 0.25)';
                ctx.fill();
            }
        }
    }

    function initParticles() {
        particles = [];
        const numParticles = Math.floor((width * height) / 13000); 
        for (let i = 0; i < numParticles; i++) particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        for (let i = 0; i < particles.length; i++) {
            particles[i].update(); 
            particles[i].draw();
            
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[j].x - particles[i].x;
                const dy = particles[j].y - particles[i].y;
                const dist = dx * dx + dy * dy;
                
                if (dist < 15000) {
                    const opacity = (1 - dist/15000) * 0.2;
                    ctx.strokeStyle = `rgba(0, 86, 179, ${opacity})`;
                    
                    // Pseudo-randomly assign DOUBLE BONDS based on particle index combinations
                    if ((i + j) % 5 === 0 && dist < 8000) {
                        // Calculate the normal vector to draw parallel double lines
                        const length = Math.sqrt(dist);
                        const nx = -dy / length;
                        const ny = dx / length;
                        const gap = 3; // Space between double bonds
                        
                        ctx.lineWidth = 1.2;
                        
                        // Bond line 1
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x + nx * gap, particles[i].y + ny * gap);
                        ctx.lineTo(particles[j].x + nx * gap, particles[j].y + ny * gap);
                        ctx.stroke();
                        
                        // Bond line 2
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x - nx * gap, particles[i].y - ny * gap);
                        ctx.lineTo(particles[j].x - nx * gap, particles[j].y - ny * gap);
                        ctx.stroke();
                    } else {
                        // Standard single bond
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        }
        requestAnimationFrame(animate);
    }
    
    window.addEventListener('resize', () => { resize(); initParticles(); });
    resize(); 
    initParticles(); 
    animate();
}
/*
// ==========================================
// CHEMISTRY THEME BACKGROUND ANIMATION
// ==========================================
function initPortalCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width, height, particles;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    // Helper function to draw a Benzene Ring (Hexagon)
    function drawHexagon(x, y, size, opacity) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const hx = x + size * Math.cos(angle);
            const hy = y + size * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(0, 86, 179, ${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Draw small circles at the vertices to represent atoms
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const hx = x + size * Math.cos(angle);
            const hy = y + size * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(hx, hy, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 86, 179, ${opacity + 0.15})`;
            ctx.fill();
        }
    }

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.3; // Very slow, calm drift
            this.vy = (Math.random() - 0.5) * 0.3;
            this.radius = Math.random() * 3 + 1.5; // Standard atom size
            
            // 15% chance for a node to be a large hexagonal ring instead of a single atom
            this.isHexagon = Math.random() > 0.85; 
            this.hexSize = Math.random() * 20 + 15;
        }
        update() {
            this.x += this.vx; 
            this.y += this.vy;
            // Bounce smoothly off edges with a slight buffer
            if (this.x < -50 || this.x > width + 50) this.vx = -this.vx;
            if (this.y < -50 || this.y > height + 50) this.vy = -this.vy;
        }
        draw() {
            if (this.isHexagon) {
                drawHexagon(this.x, this.y, this.hexSize, 0.15);
            } else {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 86, 179, 0.2)'; // Soft NTA blue
                ctx.fill();
            }
        }
    }

    function initParticles() {
        particles = [];
        // Adjust particle density based on screen size
        const numParticles = Math.floor((width * height) / 12000); 
        for (let i = 0; i < numParticles; i++) particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        for (let i = 0; i < particles.length; i++) {
            particles[i].update(); 
            particles[i].draw();
            
            // Connect nearby nodes to form organic chains
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = dx * dx + dy * dy;
                
                if (dist < 15000) {
                    ctx.beginPath();
                    // Lines fade out beautifully based on distance
                    ctx.strokeStyle = `rgba(0, 86, 179, ${(1 - dist/15000) * 0.15})`;
                    ctx.lineWidth = 1;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    
    window.addEventListener('resize', () => { resize(); initParticles(); });
    resize(); 
    initParticles(); 
    animate();
}
*/
/*
// ==========================================
// LIGHT THEME BACKGROUND ANIMATION
// ==========================================
function initPortalCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width, height, particles;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.4; 
            this.vy = (Math.random() - 0.5) * 0.4;
            this.radius = Math.random() * 2 + 1;
        }
        update() {
            this.x += this.vx; this.y += this.vy;
            if (this.x < 0 || this.x > width) this.vx = -this.vx;
            if (this.y < 0 || this.y > height) this.vy = -this.vy;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 86, 179, 0.15)'; 
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        const numParticles = Math.floor((width * height) / 12000); 
        for (let i = 0; i < numParticles; i++) particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < particles.length; i++) {
            particles[i].update(); particles[i].draw();
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = dx * dx + dy * dy;
                if (dist < 12000) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(0, 86, 179, ${(1 - dist/12000) * 0.15})`;
                    ctx.lineWidth = 1;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    window.addEventListener('resize', () => { resize(); initParticles(); });
    resize(); initParticles(); animate();
}
*/
