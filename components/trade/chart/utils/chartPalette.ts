export type ChartPalette = {
  textColor: string;
  gridColor: string;
  borderColor: string;
  volumeColor: string;
};

export const getChartPalette = (): ChartPalette => {
  let isLightMode = false;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const backgroundHsl = getComputedStyle(root).getPropertyValue('--background').trim();
    const segments = backgroundHsl.split(/\s+/);
    const lightness = Number.parseFloat((segments[2] || '').replace('%', ''));

    if (Number.isFinite(lightness)) {
      isLightMode = lightness >= 55;
    } else {
      isLightMode = root.classList.contains('light') || !root.classList.contains('dark');
    }
  }

  if (isLightMode) {
    return {
      textColor: '#475569',
      gridColor: 'rgba(148, 163, 184, 0.35)',
      borderColor: '#CBD5E1',
      volumeColor: '#94A3B8',
    };
  }

  return {
    textColor: '#9CA3AF',
    gridColor: 'rgba(31, 41, 55, 0.5)',
    borderColor: '#1F2937',
    volumeColor: '#334155',
  };
};
