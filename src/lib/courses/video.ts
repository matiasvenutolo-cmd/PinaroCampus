import type { LessonVideo } from "./schema";

/**
 * URL de embed de un video (docs/05): YouTube con `youtube-nocookie.com` o
 * Vimeo. Devuelve `null` si no hay URL o no se reconoce el formato (en ese
 * caso la lección muestra el guion como texto).
 */
export function getVideoEmbedUrl(video: LessonVideo | undefined): string | null {
  if (!video?.url) return null;
  let url: URL;
  try {
    url = new URL(video.url);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (video.provider === "youtube") {
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/)?.[1] ?? null;
    }
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d{5,})/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}
