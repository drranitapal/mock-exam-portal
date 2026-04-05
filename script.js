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
});

// ==========================================
// ANTI-CHEAT FULLSCREEN LOGIC
// ==========================================
function handleFullscreenChange() {
    // Only trigger if the exam is currently active
    if (document.getElementById('exam-screen').classList.contains('active')) {
        if (!document.fullscreenElement && !document.webkitIsFullScreen) {
            state.escapeCount = (state.escapeCount || 0) + 1;
            saveState(); // Save immediately so they can't bypass by refreshing

            if (state.escapeCount === 1) {
                alert("WARNING (1/3): You have exited full-screen mode. Escaping full-screen 3 times will result in automatic test submission.");
            } else if (state.escapeCount === 2) {
                alert("WARNING (2/3): You have exited full-screen mode again! One more time and your exam will be auto-submitted immediately.");
            } else if (state.escapeCount >= 3) {
                alert("EXAM AUTO-SUBMITTED: You have tried to escape full screen mode 3 times. Your test is now ending.");
                autoSubmit();
            }
        }
    }
}

// ==========================================
// DATA FETCHING (Now includes Settings)
// ==========================================
async function fetchQuestionBank() {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const data = await response.json();
        
        if (data.success && data.data.length > 0) {
            // Apply Timer from Google Sheets
            if (data.settings && data.settings.TimerMinutes) {
                EXAM_DURATION = parseInt(data.settings.TimerMinutes) * 60;
                if (!localStorage.getItem('mockExamState')) state.timeLeft = EXAM_DURATION;
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
        qHTML += `<br><img src="${q.ImageURL.trim()}" alt="Question Image" style="max-width:100%; margin-top:15px; border-radius:5px;">`;
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
