(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (document.querySelector(".voice-fab, .kb-voice-fab")) {
    return;
  }

  if (window.location.hostname.endsWith("github.io")) {
    return;
  }

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const FEEDBACK_PATH = "/api/feedback";
  const AUDIENCE_FALLBACK = "鐢ㄦ埛瑙嗚";
  const STATUS_RESET_MS = 1800;

  const style = document.createElement("style");
  style.textContent = `
    .kb-voice-fab {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 60;
      width: 68px;
      height: 68px;
      border: 1px solid rgba(201, 168, 76, 0.24);
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(201, 168, 76, 0.24), rgba(201, 168, 76, 0.1));
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
      backdrop-filter: blur(16px);
      cursor: pointer;
      padding: 0;
      transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
    }

    .kb-voice-fab:hover {
      transform: translateY(-2px);
    }

    .kb-voice-fab::before {
      content: "";
      position: absolute;
      inset: 18px;
      border-radius: 50%;
      border: 2px solid rgba(232, 228, 220, 0.88);
      opacity: 0.92;
    }

    .kb-voice-fab .kb-voice-core {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: #f2e4b6;
      box-shadow: 0 0 20px rgba(201, 168, 76, 0.56);
      transition: background 160ms ease, box-shadow 160ms ease;
    }

    .kb-voice-fab[data-state="recording"] {
      background: linear-gradient(180deg, rgba(232, 93, 74, 0.22), rgba(232, 93, 74, 0.08));
      border-color: rgba(232, 93, 74, 0.28);
    }

    .kb-voice-fab[data-state="recording"] .kb-voice-core {
      background: #ffd1ca;
      box-shadow: 0 0 22px rgba(232, 93, 74, 0.58);
    }

    .kb-voice-fab[data-state="success"] {
      background: linear-gradient(180deg, rgba(201, 168, 76, 0.28), rgba(201, 168, 76, 0.14));
      border-color: rgba(201, 168, 76, 0.36);
    }

    .kb-voice-fab[data-state="error"] {
      background: linear-gradient(180deg, rgba(74, 124, 247, 0.22), rgba(74, 124, 247, 0.08));
      border-color: rgba(74, 124, 247, 0.28);
    }

    .kb-voice-fab[data-state="error"] .kb-voice-core {
      background: #c9d8ff;
      box-shadow: 0 0 22px rgba(74, 124, 247, 0.58);
    }

    .kb-voice-fab[data-state="unsupported"] {
      opacity: 0.46;
      cursor: not-allowed;
    }

    @media (max-width: 720px) {
      .kb-voice-fab {
        right: 16px;
        bottom: 16px;
        width: 62px;
        height: 62px;
      }

      .kb-voice-fab::before {
        inset: 16px;
      }
    }
  `;
  document.head.appendChild(style);

  const button = document.createElement("button");
  button.className = "kb-voice-fab";
  button.type = "button";
  button.setAttribute("aria-label", "鎸変綇璇煶鍙嶉");
  button.title = "鎸変綇璇磋瘽锛屾澗寮€鍚庤嚜鍔ㄦ彁浜ゅ弽棣?;
  button.innerHTML = '<span class="kb-voice-core" aria-hidden="true"></span>';
  document.body.appendChild(button);

  let recognition = null;
  let recording = false;
  let finalTranscript = "";
  let interimTranscript = "";
  let resetTimer = null;

  function setState(state, title) {
    button.dataset.state = state;
    if (title) {
      button.title = title;
      button.setAttribute("aria-label", title);
    }
    if (resetTimer) {
      window.clearTimeout(resetTimer);
      resetTimer = null;
    }
    if (state === "success" || state === "error") {
      resetTimer = window.setTimeout(() => {
        if (!recording) {
          setState(SpeechRecognitionCtor ? "idle" : "unsupported", SpeechRecognitionCtor ? "鎸変綇璇磋瘽锛屾澗寮€鍚庤嚜鍔ㄦ彁浜ゅ弽棣? : "褰撳墠娴忚鍣ㄤ笉鏀寔璇煶鍙嶉");
        }
      }, STATUS_RESET_MS);
    }
  }

  function getAudienceLabel() {
    const active = document.querySelector('[data-audience-label].active, [data-audience-label][aria-pressed="true"]');
    return active?.dataset.audienceLabel || document.body.dataset.audienceLabel || AUDIENCE_FALLBACK;
  }

  function getCurrentSlideContext() {
    const candidates = [...document.querySelectorAll("[data-feedback-index], .slide")];
    if (!candidates.length) {
      const page = Number(document.body.dataset.feedbackPage || "1");
      return {
        page: Number.isFinite(page) && page > 0 ? page : 1,
        anchor: ""
      };
    }

    const viewportCenter = window.innerHeight / 2;
    let bestNode = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;

    candidates.forEach((node, index) => {
      const rect = node.getBoundingClientRect();
      const nodeCenter = rect.top + rect.height / 2;
      const distance = Math.abs(nodeCenter - viewportCenter);
      if (distance < bestScore) {
        bestScore = distance;
        bestNode = node;
      }
      if (rect.top <= viewportCenter && rect.bottom >= viewportCenter) {
        bestNode = node;
        bestScore = -1;
      }
      if (bestScore === -1) {
        return;
      }
    });

    const fallbackIndex = candidates.indexOf(bestNode) + 1;
    const explicitIndex = Number(bestNode.dataset.feedbackIndex || "");
    const page = Number.isFinite(explicitIndex) && explicitIndex > 0 ? explicitIndex : fallbackIndex;
    const anchor = bestNode.id ? `#${bestNode.id}` : "";

    return { page, anchor };
  }

  async function submitFeedback(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      setState("error", "娌℃湁璇嗗埆鍒拌闊?);
      return;
    }

    const response = await fetch(FEEDBACK_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        audience: getAudienceLabel(),
        page: getCurrentSlideContext().page,
        comment: trimmed,
        transcript: trimmed,
        sourceUrl: `${window.location.href.split("#")[0]}${getCurrentSlideContext().anchor}`,
        userAgent: navigator.userAgent
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || payload.error || "鎻愪氦澶辫触");
    }
  }

  function ensureRecognition() {
    if (recognition || !SpeechRecognitionCtor) {
      return;
    }

    recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {
      recording = true;
      finalTranscript = "";
      interimTranscript = "";
      setState("recording", "姝ｅ湪鏀跺惉锛屾澗寮€鍚庤嚜鍔ㄦ彁浜?);
    };

    recognition.onresult = function (event) {
      let finalChunk = "";
      let interimChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        if (!transcript) {
          continue;
        }
        if (result.isFinal) {
          finalChunk += finalChunk ? `\n${transcript}` : transcript;
        } else {
          interimChunk += interimChunk ? ` ${transcript}` : transcript;
        }
      }

      if (finalChunk) {
        finalTranscript += finalTranscript ? `\n${finalChunk}` : finalChunk;
      }
      interimTranscript = interimChunk;
    };

    recognition.onerror = function () {
      recording = false;
      setState("error", "璇煶璇嗗埆涓嶅彲鐢?);
    };

    recognition.onend = async function () {
      const transcript = `${finalTranscript}${interimTranscript ? `${finalTranscript ? "\n" : ""}${interimTranscript}` : ""}`.trim();
      recording = false;
      finalTranscript = "";
      interimTranscript = "";

      if (!transcript) {
        setState("error", "娌℃湁璇嗗埆鍒拌闊?);
        return;
      }

      try {
        await submitFeedback(transcript);
        setState("success", "宸插彂閫佽闊冲弽棣?);
      } catch (error) {
        console.error("kb_feedback_submit_failed", error);
        setState("error", "鎻愪氦澶辫触锛岃閲嶈瘯");
      }
    };
  }

  function startRecognition() {
    if (!SpeechRecognitionCtor) {
      setState("unsupported", "褰撳墠娴忚鍣ㄤ笉鏀寔璇煶鍙嶉");
      return;
    }

    ensureRecognition();
    if (recording) {
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      setState("error", "楹﹀厠椋庡垵濮嬪寲涓?);
    }
  }

  function stopRecognition() {
    if (recognition && recording) {
      recognition.stop();
    }
  }

  button.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    event.preventDefault();
    startRecognition();
  });

  window.addEventListener("pointerup", stopRecognition);
  window.addEventListener("pointercancel", stopRecognition);

  button.addEventListener("keydown", function (event) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      startRecognition();
    }
  });

  button.addEventListener("keyup", function (event) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      stopRecognition();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopRecognition();
    }
  });

  setState(SpeechRecognitionCtor ? "idle" : "unsupported", SpeechRecognitionCtor ? "鎸変綇璇磋瘽锛屾澗寮€鍚庤嚜鍔ㄦ彁浜ゅ弽棣? : "褰撳墠娴忚鍣ㄤ笉鏀寔璇煶鍙嶉");
})();

