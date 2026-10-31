import {
  Injectable,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
}
export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Provider-agnostic client for any OpenAI-compatible /chat/completions endpoint
 * (OpenAI, xAI, Groq, Together, OpenRouter, local vLLM/Ollama, ...).
 * Defaults to xAI (https://api.x.ai/v1, grok-4.3); override with AI_BASE_URL / AI_MODEL.
 * Disabled unless AI_ASSISTANT_ENABLED=true AND AI_API_KEY is set.
 */
export const AI_DEFAULT_BASE_URL = 'https://api.x.ai/v1';
export const AI_DEFAULT_MODEL = 'grok-4.3';
@Injectable()
export class AiProvider {
  private readonly logger = new Logger(AiProvider.name);
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      this.config.get<string>('AI_ASSISTANT_ENABLED') === 'true' &&
      !!this.config.get<string>('AI_API_KEY')
    );
  }

  async complete(
    messages: ChatMessage[],
    tools: ToolSpec[],
  ): Promise<ChatMessage> {
    if (!this.isConfigured())
      throw new ServiceUnavailableException('AI assistant is not enabled');
    const base = (
      this.config.get<string>('AI_BASE_URL') || AI_DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    const timeoutMs = Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 30000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.get<string>('AI_API_KEY')}`,
        },
        body: JSON.stringify({
          model: this.config.get<string>('AI_MODEL') || AI_DEFAULT_MODEL,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`AI provider HTTP ${res.status}`);
        throw new ServiceUnavailableException('AI provider error');
      }
      const data = (await res.json()) as {
        choices?: { message?: ChatMessage }[];
      };
      const msg = data.choices?.[0]?.message;
      if (!msg)
        throw new ServiceUnavailableException(
          'AI provider returned no message',
        );
      return {
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      };
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.warn(`AI provider request failed: ${(e as Error).name}`);
      throw new ServiceUnavailableException('AI provider unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
}
