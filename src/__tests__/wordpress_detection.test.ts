import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn()
  }
}));

describe('WordPress Project Detection', () => {
  const detectWordPressProject = async (projectPath: string): Promise<'wordpress' | 'react'> => {
    try {
      // Check for WordPress indicators
      const wpConfigExists = await fs.access(path.join(projectPath, 'wp-config.php'))
        .then(() => true).catch(() => false);
      const wpContentExists = await fs.access(path.join(projectPath, 'wp-content'))
        .then(() => true).catch(() => false);
      const wordpressExists = await fs.access(path.join(projectPath, 'wordpress', 'wp-content'))
        .then(() => true).catch(() => false);
      
      if (wpConfigExists || wpContentExists || wordpressExists) {
        return 'wordpress';
      }
      
      return 'react';
    } catch {
      return 'react';
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect WordPress project with wp-config.php', async () => {
    vi.mocked(fs.access).mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('wp-config.php')) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('File not found'));
    });

    const result = await detectWordPressProject('/test/project');
    expect(result).toBe('wordpress');
  });

  it('should detect WordPress project with wp-content directory', async () => {
    vi.mocked(fs.access).mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.endsWith('wp-content')) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('File not found'));
    });

    const result = await detectWordPressProject('/test/project');
    expect(result).toBe('wordpress');
  });

  it('should detect WordPress project with wordpress/wp-content structure', async () => {
    vi.mocked(fs.access).mockImplementation((filePath) => {
      if (typeof filePath === 'string' && filePath.includes('wordpress') && filePath.includes('wp-content')) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('File not found'));
    });

    const result = await detectWordPressProject('/test/project');
    expect(result).toBe('wordpress');
  });

  it('should return react for non-WordPress projects', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

    const result = await detectWordPressProject('/test/project');
    expect(result).toBe('react');
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('Permission denied'));

    const result = await detectWordPressProject('/test/project');
    expect(result).toBe('react');
  });
});

describe('WordPress System Prompt', () => {
  it('should generate correct WordPress system prompt', async () => {
    const { getWordPressSystemPrompt } = await import('../prompts/wordpress_system_prompt');
    
    const prompt = getWordPressSystemPrompt('/test/app/path');
    
    expect(prompt).toContain('WordPress');
    expect(prompt).toContain('themes');
    expect(prompt).toContain('plugins');
    expect(prompt).toContain('wp-cli');
    expect(prompt).toContain('wp-db');
    expect(prompt).toContain('/test/app/path');
  });

  it('should include WordPress operations', async () => {
    const { WORDPRESS_OPERATIONS } = await import('../prompts/wordpress_system_prompt');
    
    expect(WORDPRESS_OPERATIONS).toContain('dyad-wp-cli');
    expect(WORDPRESS_OPERATIONS).toContain('dyad-wp-db');
    expect(WORDPRESS_OPERATIONS).toContain('plugin install');
    expect(WORDPRESS_OPERATIONS).toContain('SELECT * FROM wp_posts');
  });
});