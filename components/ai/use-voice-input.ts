"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictado por voz del compositor del asistente (Web Speech API).
 *
 * La API no viene en `lib.dom`: los tipos mínimos se declaran aquí, sin `any`.
 * El reconocedor se crea sólo cuando el usuario lo pide (`start`), se corta al
 * desmontar y entrega cada frase final por `onText`. Nunca envía el mensaje:
 * el compositor decide qué hacer con el texto.
 */

type SpeechAlternative = { transcript: string };
type SpeechResult = { [index: number]: SpeechAlternative };
type SpeechResultList = { length: number; [index: number]: SpeechResult };

type SpeechRecognitionEventLike = {
  resultIndex?: number;
  results: SpeechResultList;
};

type SpeechRecognitionErrorEventLike = { error?: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

export type UseVoiceInputOptions = {
  /** Idioma del dictado; por defecto español de Chile. */
  lang?: string;
  /** Recibe cada frase final; el compositor la agrega al borrador. */
  onText: (text: string) => void;
};

export type UseVoiceInputResult = {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
  error: string | null;
};

const DEFAULT_LANG = "es-CL";

const PERMISSION_ERROR =
  "No pudimos usar el micrófono. Revisa el permiso del navegador e inténtalo otra vez.";
const AUDIO_ERROR = "No encontramos un micrófono disponible.";
const DICTATION_ERROR = "No se pudo dictar. Inténtalo otra vez.";

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speech = window as SpeechWindow;
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

/** Aviso para el usuario; null cuando el cierre no merece mensaje. */
function messageForError(code: string | undefined): string | null {
  if (!code || code === "aborted" || code === "no-speech") return null;
  if (code === "not-allowed" || code === "service-not-allowed") return PERMISSION_ERROR;
  if (code === "audio-capture") return AUDIO_ERROR;
  return DICTATION_ERROR;
}

/** Une las frases finales desde `from`; "" si no trae texto. */
function transcriptFrom(event: SpeechRecognitionEventLike, from: number): string {
  const parts: string[] = [];
  for (let index = from; index < event.results.length; index += 1) {
    const transcript = event.results[index]?.[0]?.transcript?.trim() ?? "";
    if (transcript) parts.push(transcript);
  }
  return parts.join(" ").trim();
}

export function useVoiceInput({
  lang = DEFAULT_LANG,
  onText,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // El callback vive en un ref: el reconocedor no se re-suscribe en cada render.
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  // En SSR no existe la API: se detecta tras montar para no romper la hidratación.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSupported(speechRecognitionCtor() !== null));
    return () => cancelAnimationFrame(frame);
  }, []);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Ya estaba detenido: no hay nada que hacer.
      }
    }
    // El `onend` real llega después; el botón responde de inmediato.
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = speechRecognitionCtor();
    if (!Recognition) {
      setSupported(false);
      return;
    }

    // Una sesión anterior que todavía cierra no debe bloquear la nueva.
    const previous = recognitionRef.current;
    if (previous) {
      recognitionRef.current = null;
      try {
        previous.abort?.();
      } catch {
        // Sin importancia: se descarta igual.
      }
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Recognition();
    } catch {
      setError(DICTATION_ERROR);
      return;
    }

    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;

    // Resultados finales ya volcados en esta sesión: evita repetir frases.
    let consumed = 0;

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const reported = typeof event.resultIndex === "number" ? event.resultIndex : 0;
      const text = transcriptFrom(event, Math.max(consumed, reported));
      consumed = event.results.length;
      if (text) onTextRef.current(text);
    };

    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      const message = messageForError(event.error);
      if (message) setError(message);
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);

    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError(DICTATION_ERROR);
    }
  }, [lang]);

  // Al desmontar: cortar el micrófono y olvidar los handlers pendientes.
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Ya estaba detenido: no hay nada que hacer.
      }
    };
  }, []);

  return { supported, listening, start, stop, error };
}
