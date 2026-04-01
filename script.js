/**
 * NTA-Style Mock Exam Logic
 */

// --- Constants & Defaults ---
const EXAM_DURATION = 180 * 60; // 180 minutes in seconds
const STATUS = {
    NOT_VISITED: 'not-visited',
    NOT_ANSWERED: 'not-answered',
    ANSWERED: 'answered',
    MARKED: 'marked',
    ANSWERED_MARKED: 'answered-marked'
};

// --- Dummy Data (Fallback) ---
const getDummyData = () => {
    const data = [];
    const sections = ['Physics', 'Chemistry', 'Mathematics'];
    
    sections.forEach(sec => {
        for (let i = 1; i <= 10; i++) {
            data.push({
                Section: sec,
                QID: `${sec.charAt(0)}${i}`,
                Question: `Sample ${sec} Question ${i}: What is the solution to $E = mc^2$ where $m=1, c=3 \times 10^8$? \n\n Evaluate $\\int_{0}^{1} x^2 dx$.`,
                'Option A': `$\\frac{1}{3}$`,
                'Option B': `$9 \\times 10^{16}$`,
                'Option C': `Zero`,
                'Option D': `Infinity`,
                Answer: 'B',
                Explanation: `Mass energy equivalence formula.`,
                ImageURL: ''
            });
        }
    });
    return data;
};

// --- State Management ---
let state = {
    questions: [],
    sections: [],
    currentSection: '',
    currentIndex: 0,
    answers: {},       // QID -> selected option (A, B, C, D)
    statuses: {},      // QID -> STATUS enum
    timeLeft: EXAM_DURATION,
    timerInterval: null
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    checkAdminMode();
    loadState();
    
    document.getElementById('start-exam-btn').addEventListener('click', startExam);
    document.getElementById('btn-next').addEventListener('click', () => navigate(true, true));
    document.getElementById('btn-prev').addEventListener('click', () => navigate(false, false));
    document.getElementById('btn-mark').addEventListener('click', markForReview);
    document.getElementById('btn-clear').addEventListener('click', clearResponse);
    document.getElementById('btn-submit-exam').addEventListener('click', confirmSubmit);
    document.getElementById('import-btn').addEventListener('click', handleImport);
    document.getElementById('btn-export-json').addEventListener('click', exportResults);
});

function checkAdminMode() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1') {
        document.getElementById('admin-panel').style.display = 'block';
    }
}

function loadState() {
    const saved = localStorage.getItem('mockExamState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            // If exam was already active but not submitted, start it
            if (state.timeLeft < EXAM_DURATION && state.timeLeft > 0) {
                document.getElementById('start-exam-btn').innerText = "Resume Exam";
            }
        } catch (e) {
            console.error("Failed to parse saved state", e);
        }
    }

    if (!state.questions || state.questions.length === 0) {
        state.questions = getDummyData();
    }
    
    // Extract unique sections
    state.sections = [...new Set(state.questions.map(q => q.Section))];
    if (!state.currentSection) state.currentSection = state.sections[0];

    // Initialize statuses if empty
    state.questions.forEach(q => {
        if (!state.statuses[q.QID]) {
            state.statuses[q.QID] = STATUS.NOT_VISITED;
        }
    });
}

function saveState() {
    localStorage.setItem('mockExamState', JSON.stringify(state));
}

// --- Exam Flow ---
function startExam() {
    // Request fullscreen (optional, good for mock exams)
    try {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    } catch(e) {}

    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('exam-screen').classList.add('active');
    
    startTimer();
    renderSectionNav();
    loadQuestion(0, state.currentSection);
}

function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    
    const timerDisplay = document.getElementById('timer-display');
    
    state.timerInterval = setInterval(() => {
        if (state.timeLeft <= 0) {
            clearInterval(state.timerInterval);
            autoSubmit();
            return;
        }
        state.timeLeft--;
        
        const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
        const s = (state.timeLeft % 60).toString().padStart(2, '0');
        timerDisplay.innerText = `Time Left: ${m}:${s}`;
        
        if (state.timeLeft % 30 === 0) saveState(); // Auto-save every 30s
    }, 1000);
}

// --- UI Rendering ---
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
    loadQuestion(0, sectionName); // Load first question of new section
}

function loadQuestion(index, section) {
    const sectionQs = state.questions.filter(q => q.Section === section);
    if (index < 0 || index >= sectionQs.length) return;
    
    state.currentIndex = index;
    const q = sectionQs[index];
    
    // Update status from Not Visited to Not Answered
    if (state.statuses[q.QID] === STATUS.NOT_VISITED) {
        state.statuses[q.QID] = STATUS.NOT_ANSWERED;
    }

    // Render Question Text
    document.getElementById('current-q-num').innerText = `Question ${index + 1}`;
    
    let qHTML = q.Question.replace(/\n/g, '<br>');
    if (q.ImageURL) {
        qHTML += `<br><img src="${q.ImageURL}" alt="Question Image" onerror="this.style.display='none'">`;
    }
    document.getElementById('question-text').innerHTML = qHTML;

    // Render Options
    const optContainer = document.getElementById('options-container');
    optContainer.innerHTML = '';
    
    ['A', 'B', 'C', 'D'].forEach(opt => {
        const optVal = q[`Option ${opt}`];
        if (!optVal) return;

        const label = document.createElement('label');
        label.className = 'option-label';
        
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'option';
        radio.value = opt;
        if (state.answers[q.QID] === opt) radio.checked = true;

        // Auto-save on select
        radio.addEventListener('change', (e) => {
            state.answers[q.QID] = e.target.value;
        });

        label.appendChild(radio);
        label.appendChild(document.createTextNode(`${opt}. ${optVal}`));
        optContainer.appendChild(label);
    });

    // Re-render MathJax
    if (window.MathJax) {
        MathJax.typesetPromise([document.getElementById('question-text'), document.getElementById('options-container')]);
    }

    renderPalette();
    saveState();
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
        
        // Highlight current
        if (idx === state.currentIndex) {
            btn.style.border = "2px solid #000";
        }
        
        palette.appendChild(btn);
    });

    // Update legend counts
    document.querySelector('.status-legend .not-visited').innerText = counts[STATUS.NOT_VISITED];
    document.querySelector('.status-legend .not-answered').innerText = counts[STATUS.NOT_ANSWERED];
    document.querySelector('.status-legend .answered').innerText = counts[STATUS.ANSWERED];
    document.querySelector('.status-legend .marked').innerText = counts[STATUS.MARKED];
    document.querySelector('.status-legend .answered-marked').innerText = counts[STATUS.ANSWERED_MARKED];
}

// --- Interactions ---
function getCurrentQ() {
    return state.questions.filter(q => q.Section === state.currentSection)[state.currentIndex];
}

function navigate(forward, save) {
    const q = getCurrentQ();
    
    if (save) {
        const selected = document.querySelector('input[name="option"]:checked');
        if (selected) {
            state.answers[q.QID] = selected.value;
            // If it was marked, NTA rules usually change it to "Answered & Marked" or "Answered". 
            // We set to answered if purely saving.
            if(state.statuses[q.QID] === STATUS.MARKED || state.statuses[q.QID] === STATUS.ANSWERED_MARKED) {
                state.statuses[q.QID] = STATUS.ANSWERED_MARKED;
            } else {
                state.statuses[q.QID] = STATUS.ANSWERED;
            }
        } else if (state.statuses[q.QID] !== STATUS.MARKED && state.statuses[q.QID] !== STATUS.ANSWERED_MARKED) {
            state.statuses[q.QID] = STATUS.NOT_ANSWERED;
        }
    }

    const sectionQs = state.questions.filter(qu => qu.Section === state.currentSection);
    if (forward && state.currentIndex < sectionQs.length - 1) {
        loadQuestion(state.currentIndex + 1, state.currentSection);
    } else if (!forward && state.currentIndex > 0) {
        loadQuestion(state.currentIndex - 1, state.currentSection);
    } else {
        renderPalette(); // Just update palette if bounds reached
        saveState();
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
    navigate(true, false); // Move to next
}

function clearResponse() {
    const q = getCurrentQ();
    delete state.answers[q.QID];
    state.statuses[q.QID] = STATUS.NOT_ANSWERED;
    
    const options = document.querySelectorAll('input[name="option"]');
    options.forEach(opt => opt.checked = false);
    
    renderPalette();
    saveState();
}

// --- Submission ---
function confirmSubmit() {
    if (confirm("Are you sure you want to submit the exam? You cannot change your answers after submission.")) {
        autoSubmit();
    }
}

function autoSubmit() {
    clearInterval(state.timerInterval);
    
    try {
        if (document.exitFullscreen) document.exitFullscreen();
    } catch(e){}

    document.getElementById('exam-screen').classList.remove('active');
    document.getElementById('result-screen').classList.add('active');
    
    calculateResults();
    localStorage.removeItem('mockExamState'); // Clear progress
}

function calculateResults() {
    let correct = 0, incorrect = 0, unattempted = 0;
    
    state.questions.forEach(q => {
        const ans = state.answers[q.QID];
        if (!ans) {
            unattempted++;
        } else if (ans === q.Answer) {
            correct++;
        } else {
            incorrect++;
        }
    });

    const marks = (correct * 4) - (incorrect * 1); // Standard +4/-1 scheme
    
    document.getElementById('score-summary').innerHTML = `
        <h3>Total Score: ${marks}</h3>
        <p>Correct: ${correct} (+${correct * 4})</p>
        <p>Incorrect: ${incorrect} (-${incorrect * 1})</p>
        <p>Unattempted: ${unattempted}</p>
    `;
}

function exportResults() {
    const results = {
        candidateAnswers: state.answers,
        timeRemaining: state.timeLeft,
        fullData: state.questions
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "exam_results.json");
    dlAnchorElem.click();
}

// --- Import Logic ---
function handleImport() {
    const fileInput = document.getElementById('csv-upload');
    const textInput = document.getElementById('data-paste').value.trim();
    const statusDiv = document.getElementById('import-status');
    
    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = function(e) {
            parseCSV(e.target.result, statusDiv);
        };
        reader.readAsText(fileInput.files[0]);
    } else if (textInput) {
        if (textInput.startsWith('[')) {
            // Assume JSON
            try {
                const data = JSON.parse(textInput);
                saveImportedData(data, statusDiv);
            } catch(e) {
                statusDiv.innerText = "Invalid JSON format.";
            }
        } else {
            // Assume CSV
            parseCSV(textInput, statusDiv);
        }
    } else {
        statusDiv.innerText = "Please upload a file or paste data.";
    }
}

function parseCSV(csvText, statusDiv) {
    try {
        // Basic CSV parser (handles simple quoted strings, but not nested quotes)
        const lines = csvText.split('\n').filter(l => l.trim().length > 0);
        const headers = lines[0].split(',').map(h => h.trim());
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            // Match commas not inside quotes
            const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
            const obj = {};
            headers.forEach((h, index) => {
                let val = row[index] ? row[index].trim() : '';
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                obj[h] = val;
            });
            data.push(obj);
        }
        saveImportedData(data, statusDiv);
    } catch(e) {
        statusDiv.innerText = "Error parsing CSV.";
        console.error(e);
    }
}

function saveImportedData(data, statusDiv) {
    if (!data[0] || !data[0].Section || !data[0].QID || !data[0].Question) {
        statusDiv.innerText = "Error: Missing required columns (Section, QID, Question).";
        return;
    }
    
    state.questions = data;
    localStorage.removeItem('mockExamState'); // Reset progress for new data
    state.answers = {};
    state.statuses = {};
    state.timeLeft = EXAM_DURATION;
    saveState();
    
    statusDiv.style.color = "green";
    statusDiv.innerText = `Successfully imported ${data.length} questions. Reloading...`;
    setTimeout(() => location.reload(), 1500);
}