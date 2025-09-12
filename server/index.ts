import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { projectRoutes } from './routes/projects';
import { aiRoutes } from './routes/ai';
import { healthRoutes } from './routes/health';
import { iterateRoutes } from './routes/iterate';
import { iterateASTRoutes } from './routes/iterate-ast';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register CORS
server.register(cors, {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
});

// Register Swagger/OpenAPI
server.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Lollipop API',
      description: 'API for AI-powered web experience generator',
      version: '1.0.0',
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'projects', description: 'Project endpoints' },
      { name: 'ai', description: 'AI generation endpoints' },
      { name: 'health', description: 'Health check endpoints' },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
        },
      },
    },
  },
});

// Register Swagger UI
server.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// Register routes
server.register(healthRoutes, { prefix: '/api' });
server.register(projectRoutes, { prefix: '/api/projects' });
server.register(aiRoutes, { prefix: '/api/ai' });
server.register(iterateRoutes, { prefix: '/api/iterate' });
server.register(iterateASTRoutes, { prefix: '/api/iterate' });

// Start server
const start = async () => {
  try {
    const port = 3001; // Hardcoded to avoid conflicts
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    console.log(`🚀 Server running at http://${host}:${port}`);
    console.log(`📚 API documentation available at http://${host}:${port}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();