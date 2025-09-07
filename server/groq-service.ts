import Groq from 'groq-sdk';
import { EditOperation } from './edit-engine';

export class GroqService {
  private client: Groq;
  
  constructor(apiKey?: string) {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error('GROQ_API_KEY is required');
    }
    this.client = new Groq({ apiKey: key });
  }

  async analyzeEditRequest(
    userRequest: string,
    fileContent: string,
    filePath: string
  ): Promise<EditOperation[]> {
    const systemPrompt = `You are an AI code editor assistant. Your task is to analyze user edit requests and return structured edit operations.

You must respond with a JSON array of edit operations. Each operation should have:
- type: 'insert' | 'replace' | 'delete'
- file: the file path to edit
- startLine: line number to start (1-based)
- endLine: line number to end (1-based, only for replace/delete)
- content: new content (only for insert/replace)

IMPORTANT: Line numbers are 1-based. The first line is line 1.

Examples:
- To change line 5: {"type": "replace", "file": "example.ts", "startLine": 5, "endLine": 5, "content": "new content"}
- To insert after line 10: {"type": "insert", "file": "example.ts", "startLine": 11, "content": "new line"}
- To delete lines 3-7: {"type": "delete", "file": "example.ts", "startLine": 3, "endLine": 7}

Return ONLY the JSON array, no explanation or markdown.`;

    const userPrompt = `File: ${filePath}
Current content:
\`\`\`
${fileContent}
\`\`\`

User request: ${userRequest}`;

    try {
      const completion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.1-70b-versatile',
        temperature: 0.1,
        max_tokens: 2000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from Groq');
      }

      // Parse the JSON response
      const operations = JSON.parse(response) as EditOperation[];
      
      // Validate operations
      for (const op of operations) {
        if (!op.type || !op.file) {
          throw new Error('Invalid operation: missing type or file');
        }
        if (op.type === 'insert' && (op.startLine === undefined || op.content === undefined)) {
          throw new Error('Insert operation requires startLine and content');
        }
        if (op.type === 'replace' && (op.startLine === undefined || op.endLine === undefined || op.content === undefined)) {
          throw new Error('Replace operation requires startLine, endLine, and content');
        }
        if (op.type === 'delete' && (op.startLine === undefined || op.endLine === undefined)) {
          throw new Error('Delete operation requires startLine and endLine');
        }
      }

      return operations;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Failed to parse Groq response as JSON');
      }
      throw error;
    }
  }

  async checkComplexity(userRequest: string): Promise<boolean> {
    // Simple heuristic: if the request mentions creating new features,
    // restructuring, or large-scale changes, it's complex
    const complexKeywords = [
      'create new',
      'add feature',
      'restructure',
      'refactor',
      'implement',
      'architecture',
      'multiple files',
      'entire',
      'all'
    ];

    const lowerRequest = userRequest.toLowerCase();
    return !complexKeywords.some(keyword => lowerRequest.includes(keyword));
  }
}