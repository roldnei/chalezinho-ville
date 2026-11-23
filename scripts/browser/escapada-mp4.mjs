import {BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo} from 'mediabunny';

// Photo escapadas can be rendered off the playback clock. A slow phone takes
// longer to encode, rather than dropping frames to keep up with a live recording.
export async function exportPhotos(media, {width, height, fps, videoBitsPerSecond, overlay, signal, progress = () => {}}) {
  const check = () => { if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError'); };
  check();
  const quality = new Quality({bitrate: videoBitsPerSecond, bitrateMode: 'variable'});
  const encoding = {codec: 'avc', quality, latencyMode: 'quality', alpha: 'discard', keyFrameInterval: 1};
  if (!await canEncodeVideo('avc', {...encoding, width, height, frameRate: fps})) return null;
  const images = [];
  let output;
  try {
    await document.fonts?.ready;
    check();
    for (const item of media) {
      check();
      const image = new Image();
      images.push(image);
      image.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        const finish = error => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          image.onload = image.onerror = null;
          error ? reject(error) : resolve();
        };
        const abort = () => finish(new DOMException('Cancelado', 'AbortError'));
        const timer = setTimeout(() => finish(Error('media_timeout')), 20000);
        image.onload = () => image.naturalWidth ? finish() : finish(Error('media_unavailable'));
        image.onerror = () => finish(Error('media_unavailable'));
        signal?.addEventListener('abort', abort, {once: true});
        image.src = item.url;
      });
    }
    const canvas = document.createElement('canvas'), layer = document.createElement('canvas');
    canvas.width = layer.width = width;
    canvas.height = layer.height = height;
    const ctx = canvas.getContext('2d', {alpha: false, colorSpace: 'srgb'});
    const scratch = layer.getContext('2d', {alpha: false, colorSpace: 'srgb'});
    if (!ctx || !scratch) throw Error('export_unavailable');
    ctx.imageSmoothingQuality = scratch.imageSmoothingQuality = 'high';
    const timeline = window.VillegramTimeline, clips = timeline.sequence(media);
    const duration = clips.at(-1)?.end || 0, frames = Math.round(duration * fps);
    if (!frames) throw Error('media_unavailable');
    const target = new BufferTarget();
    output = new Output({format: new Mp4OutputFormat({fastStart: 'in-memory'}), target});
    const source = new CanvasSource(canvas, encoding);
    output.addVideoTrack(source, {frameRate: fps});
    await output.start();
    for (let frame = 0; frame < frames; frame++) {
      check();
      const timestamp = frame / fps;
      timeline.renderSequenceFrame(ctx, scratch, clips, images, timestamp, {overlay});
      await source.add(timestamp, 1 / fps);
      progress(Math.min(99, Math.round((frame + 1) / frames * 100)));
      // Let progress, cancellation and other browser work run between batches.
      if (frame % 5 === 4) await new Promise(resolve => setTimeout(resolve, 0));
    }
    check();
    source.close();
    await output.finalize();
    check();
    if (!target.buffer?.byteLength) throw Error('export_failed');
    progress(100);
    return new Blob([target.buffer], {type: 'video/mp4'});
  } finally {
    if (output && !['finalized', 'canceled'].includes(output.state)) await output.cancel();
    for (const image of images) image.removeAttribute('src');
  }
}
