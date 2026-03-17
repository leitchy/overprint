import { describe, it, expect } from 'vitest';
import { detectMapFileType } from './detect-file-type';

function mockFile(name: string, type: string): File {
  return new File([''], name, { type });
}

describe('detectMapFileType', () => {
  it('detects PNG by MIME type', () => {
    expect(detectMapFileType(mockFile('map.png', 'image/png'))).toBe('raster');
  });

  it('detects JPEG by MIME type', () => {
    expect(detectMapFileType(mockFile('map.jpg', 'image/jpeg'))).toBe('raster');
  });

  it('detects GIF by MIME type', () => {
    expect(detectMapFileType(mockFile('map.gif', 'image/gif'))).toBe('raster');
  });

  it('detects TIFF by MIME type', () => {
    expect(detectMapFileType(mockFile('map.tiff', 'image/tiff'))).toBe('raster');
  });

  it('detects PDF by MIME type', () => {
    expect(detectMapFileType(mockFile('map.pdf', 'application/pdf'))).toBe('pdf');
  });

  it('falls back to extension for PNG', () => {
    expect(detectMapFileType(mockFile('map.png', ''))).toBe('raster');
  });

  it('falls back to extension for JPG', () => {
    expect(detectMapFileType(mockFile('map.jpg', ''))).toBe('raster');
  });

  it('falls back to extension for JPEG', () => {
    expect(detectMapFileType(mockFile('map.jpeg', ''))).toBe('raster');
  });

  it('falls back to extension for PDF', () => {
    expect(detectMapFileType(mockFile('map.pdf', ''))).toBe('pdf');
  });

  it('falls back to extension for BMP', () => {
    expect(detectMapFileType(mockFile('map.bmp', ''))).toBe('raster');
  });

  it('returns unknown for unsupported types', () => {
    expect(detectMapFileType(mockFile('data.csv', 'text/csv'))).toBe('unknown');
  });

  it('returns unknown for no type and unrecognised extension', () => {
    expect(detectMapFileType(mockFile('file.xyz', ''))).toBe('unknown');
  });

  it('handles case-insensitive extensions', () => {
    expect(detectMapFileType(mockFile('MAP.PNG', ''))).toBe('raster');
  });
});
