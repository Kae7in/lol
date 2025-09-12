import Groq from 'groq-sdk';

export interface RewriteRequest {
  file: string;
  instructions: string[];
  code: Record<string, string>;
}

export class SimpleRewriter {
  private groq: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY environment variable is required');
    }
    this.groq = new Groq({ apiKey });
  }

  async rewriteFile(
    originalContent: string,
    changes: RewriteRequest
  ): Promise<string> {
    const prompt = `You are a code integration assistant. Your job is to integrate the provided code changes into an existing file.

ORIGINAL FILE:
${originalContent}

INSTRUCTIONS:
${changes.instructions.join('\n')}

CODE TO INTEGRATE:
${Object.entries(changes.code).map(([key, code]) => `// ${key}:\n${code}`).join('\n\n')}

OUTPUT THE COMPLETE FILE WITH ALL CHANGES INTEGRATED. Do not add any markdown formatting, explanations, or comments. Return only the raw file content.`;

    const completion = await this.groq.chat.completions.create({
      model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 8000
    });

    const result = completion.choices[0]?.message?.content;
    if (!result) {
      throw new Error('No response from Groq');
    }

    return result.trim();
  }
}

export const simpleRewriter = new SimpleRewriter();