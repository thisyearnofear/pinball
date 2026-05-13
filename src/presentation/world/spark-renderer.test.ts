import { describe, it, expect, vi } from 'vitest';
import { SparkWorldRenderer } from './spark-renderer';
import { MARBLE_WORLDS } from '../../config/worlds';

describe('SparkWorldRenderer', () => {
  it('should initialize and load a world correctly', async () => {
    const renderer = new SparkWorldRenderer();
    const container = document.createElement('div');
    
    // Spy on console to verify lifecycle logs if needed
    const logSpy = vi.spyOn(console, 'log');
    
    await renderer.initialize(container);
    await renderer.loadWorld(MARBLE_WORLDS.HOBBITON);
    
    expect(logSpy).toHaveBeenCalledWith('Initializing SparkWorldRenderer...');
    expect(logSpy).toHaveBeenCalledWith('Loading world:', 'Hobbiton', 'from', MARBLE_WORLDS.HOBBITON.spzUrl);
    
    renderer.dispose();
  });
});
