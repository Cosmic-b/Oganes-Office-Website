const SHOT_COUNT = 5;
const DATABASE_URL = "../joints/joints.json";
const VISIBILITY_VALUES = new Set(["hidden", "shown", "flagman"]);

const form = document.querySelector("#project-form");
const formTitle = document.querySelector("#form-title");
const output = document.querySelector("#output");
const databaseList = document.querySelector("#database-list");
const projectCount = document.querySelector("#project-count");
const status = document.querySelector("#status");
const nameInput = document.querySelector("#name");
const typetagInput = document.querySelector("#typetag");
const visibilityInput = document.querySelector("#visibility");
const youtubeInput = document.querySelector("#youtube");
const descriptionInput = document.querySelector("#description");
const shotsFields = document.querySelector("#shots-fields");
const submitButton = document.querySelector("#submit-button");
const cancelButton = document.querySelector("#cancel-button");
const jsonFileInput = document.querySelector("#json-file");
const saveFilenameInput = document.querySelector("#save-filename");
const saveJsonButton = document.querySelector("#save-json-button");

let projects = [];
let editingIndex = null;

shotsFields.innerHTML = Array.from({ length: SHOT_COUNT }, (_, index) => `
    <div class="shot-row">
        <p>Shot ${index + 1}</p>
        <div class="field">
            <label for="shot-${index + 1}">Full-size path</label>
            <input id="shot-${index + 1}" data-shot-path type="text" autocomplete="off" placeholder="./joints/project-name/shot-${index + 1}.webp" required>
        </div>
        <div class="field">
            <label for="thumbnail-${index + 1}">Thumbnail path</label>
            <input id="thumbnail-${index + 1}" data-thumbnail-path type="text" autocomplete="off" placeholder="./joints/project-name/thumb-${index + 1}.webp" required>
        </div>
    </div>
`).join("");

const shotPathInputs = [...document.querySelectorAll("[data-shot-path]")];
const thumbnailPathInputs = [...document.querySelectorAll("[data-thumbnail-path]")];

[...shotPathInputs, ...thumbnailPathInputs].forEach(input => {
    input.dataset.automatic = "true";
    input.addEventListener("input", () => {
        input.dataset.automatic = "false";
    });
});

nameInput.addEventListener("input", suggestMediaPaths);

function suggestMediaPaths() {
    const folder = formatFolderName(nameInput.value);

    shotPathInputs.forEach((input, index) => {
        if (!input.value || input.dataset.automatic === "true") {
            input.value = folder ? `./joints/${folder}/shot-${String(index + 1).padStart(2, "0")}.webp` : "";
            input.dataset.automatic = "true";
        }
    });

    thumbnailPathInputs.forEach((input, index) => {
        if (!input.value || input.dataset.automatic === "true") {
            input.value = folder ? `./joints/${folder}/thumb-${String(index + 1).padStart(2, "0")}.webp` : "";
            input.dataset.automatic = "true";
        }
    });
}

function formatFolderName(value) {
    return value.trim()
        .toLocaleLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
        .replace(/^-|-$/g, "");
}

form.addEventListener("submit", event => {
    event.preventDefault();

    const candidate = readFormProject();
    const result = normalizeProject(candidate);

    if (!result.project) {
        showStatus(result.error, true);
        return;
    }

    const duplicateIndex = projects.findIndex(project =>
        project.name.toLocaleLowerCase() === result.project.name.toLocaleLowerCase()
    );

    if (duplicateIndex !== -1 && duplicateIndex !== editingIndex) {
        showStatus("A project with that name already exists.", true);
        nameInput.focus();
        return;
    }

    if (editingIndex === null) {
        projects.unshift(result.project);
        showStatus(`Added "${result.project.name}".`);
    } else {
        projects[editingIndex] = result.project;
        showStatus(`Updated "${result.project.name}".`);
    }

    resetForm();
    renderDatabase();
});

function readFormProject() {
    return {
        name: nameInput.value,
        typetag: typetagInput.value,
        visibility: visibilityInput.value,
        youtube: youtubeInput.value,
        shots: shotPathInputs.map((input, index) => ({
            path: input.value,
            thumbnail: thumbnailPathInputs[index].value
        })),
        description: descriptionInput.value
    };
}

function normalizeProject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return invalid("Each project must be a JSON object.");
    }

    const name = cleanString(value.name);
    const typetag = cleanString(value.typetag);
    const visibility = cleanString(value.visibility).toLowerCase();
    const youtube = cleanString(value.youtube);
    const description = cleanString(value.description);

    if (!name) return invalid("Project name is required.");
    if (!typetag) return invalid(`Type tag is required for "${name}".`);
    if (!VISIBILITY_VALUES.has(visibility)) {
        return invalid(`Visibility for "${name}" must be hidden, shown, or flagman.`);
    }
    if (!isYouTubeUrl(youtube)) {
        return invalid(`Enter a valid YouTube link for "${name}".`);
    }
    if (!description) return invalid(`Description is required for "${name}".`);
    if (!Array.isArray(value.shots) || value.shots.length !== SHOT_COUNT) {
        return invalid(`"${name}" must contain exactly ${SHOT_COUNT} shots.`);
    }

    const shots = [];

    for (let index = 0; index < SHOT_COUNT; index += 1) {
        const shot = value.shots[index];
        const path = cleanString(shot?.path);
        const thumbnail = cleanString(shot?.thumbnail);

        if (!path || !thumbnail) {
            return invalid(`Shot ${index + 1} for "${name}" needs both a full-size and thumbnail path.`);
        }

        shots.push({ path, thumbnail });
    }

    return {
        project: { name, typetag, visibility, youtube, shots, description },
        error: ""
    };
}

function invalid(error) {
    return { project: null, error };
}

function cleanString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function isYouTubeUrl(value) {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
        return url.protocol === "https:" && (
            hostname === "youtu.be" ||
            hostname === "youtube.com" ||
            hostname.endsWith(".youtube.com") ||
            hostname === "youtube-nocookie.com" ||
            hostname.endsWith(".youtube-nocookie.com")
        );
    } catch {
        return false;
    }
}

async function loadProjects() {
    try {
        const response = await fetch(DATABASE_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const imported = validateProjectList(data);
        projects = imported.projects;
        showStatus(`Loaded ${projects.length} project(s) from joints/joints.json.${imported.skippedMessage}`);
    } catch (error) {
        projects = [];
        showStatus(`Could not load joints/joints.json; started empty. ${error.message}`, true);
    }

    renderDatabase();
}

function validateProjectList(data) {
    if (!Array.isArray(data)) throw new Error("The JSON root must be an array.");

    const validProjects = [];
    const usedNames = new Set();
    let skipped = 0;

    data.forEach(value => {
        const result = normalizeProject(value);
        const normalizedName = result.project?.name.toLocaleLowerCase();

        if (!result.project || usedNames.has(normalizedName)) {
            skipped += 1;
            return;
        }

        usedNames.add(normalizedName);
        validProjects.push(result.project);
    });

    return {
        projects: validProjects,
        skippedMessage: skipped ? ` Skipped ${skipped} invalid or duplicate item(s).` : ""
    };
}

function renderDatabase() {
    projectCount.textContent = `${projects.length} project${projects.length === 1 ? "" : "s"}`;

    if (projects.length === 0) {
        databaseList.innerHTML = '<p class="empty-state">No projects yet.</p>';
    } else {
        databaseList.innerHTML = projects.map((project, index) => `
            <article class="project-card">
                <div class="project-summary">
                    <div class="project-meta">
                        <span class="visibility visibility-${escapeHtml(project.visibility)}">${escapeHtml(project.visibility)}</span>
                        <span>${escapeHtml(project.typetag)}</span>
                    </div>
                    <h3>${escapeHtml(project.name)}</h3>
                    <p>${escapeHtml(project.description)}</p>
                    <p class="media-count">1 video · ${project.shots.length} shots · ${project.shots.length} thumbnails</p>
                </div>
                <div class="project-actions">
                    <button type="button" data-action="modify" data-index="${index}">Edit</button>
                    <button class="danger" type="button" data-action="delete" data-index="${index}">Delete</button>
                </div>
            </article>
        `).join("");
    }

    output.textContent = `${JSON.stringify(projects, null, 2)}\n`;
}

databaseList.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const index = Number(button.dataset.index);
    const project = projects[index];
    if (!project) return;

    if (button.dataset.action === "delete") {
        if (!window.confirm(`Delete "${project.name}" from this working database?`)) return;
        projects.splice(index, 1);
        resetForm();
        renderDatabase();
        showStatus(`Deleted "${project.name}". Export JSON to save this change.`);
        return;
    }

    editingIndex = index;
    nameInput.value = project.name;
    typetagInput.value = project.typetag;
    visibilityInput.value = project.visibility;
    youtubeInput.value = project.youtube;
    descriptionInput.value = project.description;
    project.shots.forEach((shot, shotIndex) => {
        shotPathInputs[shotIndex].value = shot.path;
        thumbnailPathInputs[shotIndex].value = shot.thumbnail;
        shotPathInputs[shotIndex].dataset.automatic = "false";
        thumbnailPathInputs[shotIndex].dataset.automatic = "false";
    });
    formTitle.textContent = `Edit ${project.name}`;
    submitButton.textContent = "Save changes";
    cancelButton.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    nameInput.focus({ preventScroll: true });
    showStatus(`Editing "${project.name}".`);
});

cancelButton.addEventListener("click", () => {
    resetForm();
    showStatus("Changes cancelled.");
});

jsonFileInput.addEventListener("change", async () => {
    const file = jsonFileInput.files[0];
    if (!file) return;

    try {
        const imported = validateProjectList(JSON.parse(await file.text()));
        projects = imported.projects;
        resetForm();
        renderDatabase();
        showStatus(`Loaded ${projects.length} project(s) from "${file.name}".${imported.skippedMessage}`);
    } catch (error) {
        showStatus(`Could not import "${file.name}": ${error.message}`, true);
    } finally {
        jsonFileInput.value = "";
    }
});

saveJsonButton.addEventListener("click", () => {
    const filename = formatJsonFilename(saveFilenameInput.value);
    const blob = new Blob([`${JSON.stringify(projects, null, 2)}\n`], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");

    downloadLink.href = downloadUrl;
    downloadLink.download = filename;
    downloadLink.click();
    URL.revokeObjectURL(downloadUrl);

    saveFilenameInput.value = filename;
    showStatus(`Saved ${projects.length} project(s) to "${filename}".`);
});

function formatJsonFilename(value) {
    const filename = value.trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
        .replace(/^\.+/, "");
    const safeFilename = filename || "joints";
    return safeFilename.toLowerCase().endsWith(".json") ? safeFilename : `${safeFilename}.json`;
}

function resetForm() {
    form.reset();
    [...shotPathInputs, ...thumbnailPathInputs].forEach(input => {
        input.dataset.automatic = "true";
    });
    editingIndex = null;
    formTitle.textContent = "Add project";
    submitButton.textContent = "Add project";
    cancelButton.hidden = true;
}

function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

loadProjects();
