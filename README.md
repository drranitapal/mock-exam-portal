# NTA-Style Mock Exam Platform

A fully client-side, responsive mock examination portal built with HTML, CSS, and Vanilla JavaScript. It mimics the UI/UX of Indian national exams like JEE and NEET.

## Features
- **Zero Backend**: Runs entirely in the browser using `localStorage`.
- **NTA-Style UI**: Includes the color-coded Question Palette (Not Visited, Answered, Marked for Review, etc.).
- **MathJax Support**: Automatically renders LaTeX equations enclosed in `$...$` or `$$...$$`.
- **State Saving**: Accidental refresh? Progress and timer are auto-saved.
- **Admin Importer**: Dynamically import new question sets via CSV or JSON.

## How to Deploy on GitHub Pages

1. **Create a Repository:**
   - Log into your GitHub account.
   - Create a new repository (e.g., `mock-exam-platform`).
   
2. **Upload Files:**
   - Upload `index.html`, `style.css`, `script.js`, and `questions-sample.csv` to the root of your repository.

3. **Enable GitHub Pages:**
   - Go to the **Settings** tab of your repository.
   - Click on **Pages** in the left sidebar.
   - Under "Build and deployment", set the **Source** to `Deploy from a branch`.
   - Under "Branch", select `main` (or `master`) and `/ (root)`. 
   - Click **Save**.

4. **Access the Site:**
   - GitHub will provide a URL (usually `https://[your-username].github.io/[repo-name]/`).
   - Give it 1-2 minutes to deploy, then visit the link.

## How to Import Questions (Admin Mode)

By default, the UI hides the import panel to prevent students from tampering with it. 
To import your own questions:
1. Navigate to your deployed URL and add `?admin=1` to the end of it.
   *(Example: `https://username.github.io/mock-exam/?admin=1`)*
2. An "Admin: Import Questions" box will appear on the setup screen.
3. Paste the contents of `questions-sample.csv` or upload your own CSV following the exact headers provided.
4. Click **Import Data**. The application will parse it, save it to `localStorage`, and reload the exam with your new questions!