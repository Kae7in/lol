import Groq from 'groq-sdk';

export class GroqService {
  private client: Groq;
  
  constructor(apiKey?: string) {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error('GROQ_API_KEY is required');
    }
    this.client = new Groq({ apiKey: key });
  }

  async rewriteFile(
    userRequest: string,
    fileContent: string,
    filePath: string
  ): Promise<string> {
    const systemPrompt = `You are a mechanical code editor. Apply the EXACT changes specified.

IMPORTANT RULES:
1. Return ONLY the complete rewritten file content
2. NO markdown, NO explanations, NO comments
3. Apply the changes EXACTLY as specified
4. Keep everything else UNCHANGED
5. If instructions say "Find X and replace with Y", do exactly that

The response must be the exact file content that will be saved.`;

    const userPrompt = `File: ${filePath}
Current content:
${fileContent}

Instructions to apply: ${userRequest}

Apply these changes and return the complete updated file:`;

    try {
      const completion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
        temperature: 0.1,
        max_tokens: 4000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from Groq');
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to rewrite file: ${error}`);
    }
  }
}