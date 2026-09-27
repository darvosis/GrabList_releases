"use strict";

const BASE_SCENE_DURATION = 8500;
const chapters = [
  { id: 1, name: "Instalación" },
  { id: 2, name: "Nicotine+" },
  { id: 3, name: "Activar el plugin" },
  { id: 4, name: "Primera playlist" },
  { id: 5, name: "Buscar" },
  { id: 6, name: "Descargar" },
  { id: 7, name: "Reproducir" },
  { id: 8, name: "Playlist con OCR" },
  { id: 9, name: "Ordenar" },
  { id: 10, name: "Decks" },
];

const allScenes = [...document.querySelectorAll(".scene")];
const chapterButtons = [...document.querySelectorAll(".chapter[data-chapter]")];
const previousButton = document.getElementById("previous");
const nextButton = document.getElementById("next");
const playButton = document.getElementById("play-pause");
const motionButton = document.getElementById("motion-toggle");
const textSizeButtons = [...document.querySelectorAll("[data-text-size]")];
const stepLabel = document.getElementById("current-step");
const stepTotal = document.getElementById("step-total");
const chapterEyebrow = document.getElementById("chapter-eyebrow");
const lessonName = document.getElementById("lesson-name");
const railProgress = document.getElementById("rail-progress");
const progress = document.getElementById("timeline-progress");
const dotsBox = document.querySelector(".timeline-dots");
const toast = document.getElementById("chapter-toast");

let currentChapter = 1;
let currentScene = 0;
let playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let reducedMotion = !playing;
let elapsed = 0;
let lastFrame = performance.now();
let toastTimer = null;

const TEXT_SIZE_KEY = "djassist-tutorial-text-size";
const TEXT_SIZE_INCREMENTS = { normal: 0, large: 1.5, xlarge: 3 };
let textSize = "large";

function elementsWithText() {
  const roots = [document.querySelector(".tutorial-shell"), toast].filter(Boolean);
  return roots.flatMap((root) => [root, ...root.querySelectorAll("*")]).filter((element) =>
    [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
  );
}

function setTextSize(size, { persist = true } = {}) {
  textSize = Object.hasOwn(TEXT_SIZE_INCREMENTS, size) ? size : "large";
  const increment = TEXT_SIZE_INCREMENTS[textSize];
  document.documentElement.dataset.textSize = textSize;

  for (const element of elementsWithText()) {
    if (!element.dataset.baseFontSize) {
      element.dataset.baseFontSize = String(parseFloat(getComputedStyle(element).fontSize));
    }

    const base = Number(element.dataset.baseFontSize);
    // Los títulos grandes conservan su escala; el control está pensado para
    // etiquetas, ayudas, botones y párrafos que necesitan más legibilidad.
    element.style.fontSize = base <= 18 ? `${base + increment}px` : "";
  }

  textSizeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.textSize === textSize));
  });

  if (persist) {
    try {
      localStorage.setItem(TEXT_SIZE_KEY, textSize);
    } catch {
      // El tutorial sigue funcionando si el navegador bloquea almacenamiento local.
    }
  }
}

function chapterScenes(chapter = currentChapter) {
  return allScenes.filter((scene) => Number(scene.dataset.chapter) === chapter);
}

function activeScene() {
  return chapterScenes()[currentScene];
}

function currentDuration() {
  const textLength = (activeScene()?.innerText || "").trim().length;
  return Math.max(BASE_SCENE_DURATION, Math.min(12000, textLength * 20));
}

function sceneProgress() {
  const count = chapterScenes().length || 1;
  return Math.min(1, (currentScene + elapsed / currentDuration()) / count);
}

function setHash() {
  const nextHash = `#capitulo-${currentChapter}/${currentScene + 1}`;
  if (location.hash !== nextHash) history.replaceState(null, "", nextHash);
}

function renderDots() {
  const count = chapterScenes().length;
  dotsBox.replaceChildren();

  for (let index = 0; index < count; index += 1) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.dataset.go = index;
    dot.setAttribute("aria-label", `Ir a escena ${index + 1}`);
    dot.setAttribute("aria-selected", String(index === currentScene));
    dot.classList.toggle("active", index === currentScene);
    dot.classList.toggle("done", index < currentScene);
    dot.addEventListener("click", () => showScene(index, { autoplay: false }));
    dotsBox.appendChild(dot);
  }
}

function updateChapterRail() {
  document.querySelectorAll(".chapter-state").forEach((indicator) => indicator.remove());

  chapterButtons.forEach((button) => {
    const chapter = Number(button.dataset.chapter);
    button.classList.toggle("active", chapter === currentChapter);
    button.classList.toggle("complete", chapter < currentChapter);

    if (chapter === currentChapter) {
      const indicator = document.createElement("i");
      indicator.className = "chapter-state";
      indicator.setAttribute("aria-hidden", "true");
      button.appendChild(indicator);
    }
  });
}

function updateControls() {
  const scenes = chapterScenes();
  const chapter = chapters[currentChapter - 1];
  const atStart = currentChapter === 1 && currentScene === 0;
  const atChapterEnd = currentScene === scenes.length - 1;
  const atTutorialEnd = currentChapter === chapters.length && atChapterEnd;

  stepLabel.textContent = String(currentScene + 1).padStart(2, "0");
  stepTotal.textContent = String(scenes.length).padStart(2, "0");
  chapterEyebrow.textContent = `CAPÍTULO ${String(currentChapter).padStart(2, "0")}`;
  lessonName.textContent = chapter.name;
  railProgress.textContent = `CAPÍTULO ${currentChapter} DE ${chapters.length}`;
  previousButton.disabled = atStart;

  if (atTutorialEnd) {
    nextButton.innerHTML = 'VOLVER AL INICIO <span aria-hidden="true">↺</span>';
  } else if (atChapterEnd) {
    nextButton.innerHTML = 'SIGUIENTE CAPÍTULO <span aria-hidden="true">→</span>';
  } else {
    nextButton.innerHTML = 'SIGUIENTE <span aria-hidden="true">→</span>';
  }

  playButton.classList.toggle("paused", !playing);
  playButton.setAttribute("aria-label", playing ? "Pausar avance automático" : "Continuar avance automático");
  renderDots();
  updateChapterRail();
}

function showScene(index, { autoplay = playing, updateHash = true } = {}) {
  const scenes = chapterScenes();
  currentScene = Math.max(0, Math.min(scenes.length - 1, index));

  allScenes.forEach((scene) => {
    const isCurrentChapter = Number(scene.dataset.chapter) === currentChapter;
    const sceneIndex = Number(scene.dataset.scene);
    const isActive = isCurrentChapter && sceneIndex === currentScene;
    scene.classList.toggle("active", isActive);
    scene.classList.toggle("exiting", isCurrentChapter && sceneIndex < currentScene);
    scene.setAttribute("aria-hidden", String(!isActive));
  });

  elapsed = 0;
  lastFrame = performance.now();
  playing = autoplay && !reducedMotion;
  updateControls();
  progress.style.width = `${sceneProgress() * 100}%`;
  if (updateHash) setHash();
}

function showChapter(chapter, scene = 0, { autoplay = playing, announce = false, updateHash = true } = {}) {
  currentChapter = Math.max(1, Math.min(chapters.length, chapter));
  currentScene = 0;
  showScene(scene, { autoplay, updateHash });

  if (announce && currentChapter > 1) {
    showChapterToast();
  }
}

function showChapterToast() {
  const chapter = chapters[currentChapter - 1];
  toast.querySelector("span").textContent = String(currentChapter).padStart(2, "0");
  toast.querySelector("b").textContent = chapter.name;
  toast.querySelector("small").textContent = `Capítulo ${currentChapter} de ${chapters.length}`;
  clearTimeout(toastTimer);
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function move(step) {
  const scenes = chapterScenes();

  if (step > 0) {
    if (currentScene < scenes.length - 1) {
      showScene(currentScene + 1, { autoplay: playing });
    } else if (currentChapter < chapters.length) {
      showChapter(currentChapter + 1, 0, { autoplay: playing, announce: true });
    } else {
      showChapter(1, 0, { autoplay: false });
    }
    return;
  }

  if (currentScene > 0) {
    showScene(currentScene - 1, { autoplay: playing });
  } else if (currentChapter > 1) {
    const previousChapter = currentChapter - 1;
    showChapter(previousChapter, chapterScenes(previousChapter).length - 1, { autoplay: playing });
  }
}

function togglePlayback() {
  if (reducedMotion) {
    reducedMotion = false;
    document.documentElement.classList.remove("reduce-motion");
    motionButton.setAttribute("aria-pressed", "false");
  }

  playing = !playing;
  lastFrame = performance.now();
  updateControls();
}

function toggleMotion() {
  reducedMotion = !reducedMotion;
  document.documentElement.classList.toggle("reduce-motion", reducedMotion);
  motionButton.setAttribute("aria-pressed", String(reducedMotion));

  if (reducedMotion) playing = false;
  lastFrame = performance.now();
  updateControls();
}

function animate(now) {
  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;

  if (playing) {
    elapsed += delta;

    if (elapsed >= currentDuration()) {
      const isLastScene = currentScene === chapterScenes().length - 1;
      const isLastChapter = currentChapter === chapters.length;

      if (isLastScene && isLastChapter) {
        playing = false;
        elapsed = currentDuration();
        updateControls();
      } else {
        move(1);
      }
    }
  }

  progress.style.width = `${sceneProgress() * 100}%`;
  requestAnimationFrame(animate);
}

function initialLocation() {
  const match = location.hash.match(/^#capitulo-(\d+)\/(\d+)$/);
  if (!match) return { chapter: 1, scene: 0 };
  return {
    chapter: Math.max(1, Math.min(chapters.length, Number(match[1]))),
    scene: Math.max(0, Number(match[2]) - 1),
  };
}

previousButton.addEventListener("click", () => move(-1));
nextButton.addEventListener("click", () => move(1));
playButton.addEventListener("click", togglePlayback);
motionButton.addEventListener("click", toggleMotion);
textSizeButtons.forEach((button) => button.addEventListener("click", () => {
  setTextSize(button.dataset.textSize);
}));
chapterButtons.forEach((button) => button.addEventListener("click", () => {
  showChapter(Number(button.dataset.chapter), 0, { autoplay: false });
}));

document.querySelector(".tutorial-brand").addEventListener("click", (event) => {
  event.preventDefault();
  showChapter(1, 0, { autoplay: false });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") move(-1);
  if (event.key === "ArrowRight") move(1);
  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
  }
});

if (reducedMotion) {
  document.documentElement.classList.add("reduce-motion");
  motionButton.setAttribute("aria-pressed", "true");
}

const initial = initialLocation();
try {
  textSize = localStorage.getItem(TEXT_SIZE_KEY) || "large";
} catch {
  textSize = "large";
}
setTextSize(textSize, { persist: false });
showChapter(initial.chapter, initial.scene, { autoplay: playing, updateHash: true });
requestAnimationFrame(animate);
