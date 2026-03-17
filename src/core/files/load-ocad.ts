interface LoadOcadResult {
  image: HTMLImageElement;
  width: number;
  height: number;
  scale: number | null; // Map scale extracted from OCAD metadata
  arrayBuffer: ArrayBuffer;
}

export async function loadOcadMap(file: File): Promise<LoadOcadResult> {
  // Lazy import to avoid loading ocad2geojson at module evaluation
  const ocad2geojson = await import('ocad2geojson');

  const arrayBuffer = await file.arrayBuffer();
  const ocadFile = await ocad2geojson.readOcad(arrayBuffer);

  // Generate SVG from OCAD data
  const svgResult = ocad2geojson.ocadToSvg(ocadFile, {});

  // ocadToSvg can return Text | SVGElement — we need the SVGElement
  if (!(svgResult instanceof SVGElement)) {
    throw new Error('OCAD SVG rendering failed: unexpected output type');
  }

  const svgEl = svgResult;

  // Ensure SVG has explicit width/height (required for <img> rasterization)
  if (!svgEl.getAttribute('width')) {
    const viewBox = svgEl.getAttribute('viewBox')?.split(' ');
    if (viewBox && viewBox.length === 4) {
      svgEl.setAttribute('width', viewBox[2]!);
      svgEl.setAttribute('height', viewBox[3]!);
    }
  }

  // Convert SVG to image via Blob URL
  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to render OCAD SVG: ${file.name}`));
    img.src = url;
  });

  URL.revokeObjectURL(url);

  // Extract map scale from OCAD parameter strings
  const scale = extractMapScale(ocadFile);

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    scale,
    arrayBuffer,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMapScale(ocadFile: any): number | null {
  try {
    const params = ocadFile.parameterStrings;
    if (!params) return null;

    // OCAD parameter strings contain scale info
    // Look for entries with 'm' field (map scale parameter)
    for (const param of Object.values(params) as Array<Array<Record<string, string>>>) {
      if (!Array.isArray(param)) continue;
      for (const entry of param) {
        if (entry && typeof entry === 'object' && 'm' in entry) {
          const scaleValue = Number(entry['m']);
          if (scaleValue > 0 && scaleValue < 1_000_000) {
            return scaleValue;
          }
        }
      }
    }
  } catch {
    // Scale extraction is best-effort
  }
  return null;
}
