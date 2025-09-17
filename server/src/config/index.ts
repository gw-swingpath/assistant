import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = !isProduction && !isTest

// Load env files in dev only
if (isDevelopment) {
  const envLocal = path.resolve(process.cwd(), '.env.local')
  const env = path.resolve(process.cwd(), '.env')
  const dotenv = require('dotenv') as typeof import('dotenv')
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal })
  if (fs.existsSync(env)) dotenv.config({ path: env })
}

const urlSchema = z.string().url()
const base64Key32 = z
  .string()
  .min(1)
  .refine((v) => {
    try {
      const buf = Buffer.from(v, 'base64')
      return buf.length === 32
    } catch {
      return false
    }
  }, 'must be base64-encoded 32-byte key')

const e164 = z.string().regex(/^\+\d{7,15}$/)

const boolFromEnv = (v: string | undefined, fallback: boolean) => {
  if (v == null) return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

const splitCsv = (v: string | undefined, fallback: string[]) =>
  v && v.trim().length > 0 ? v.split(',').map((s) => s.trim()) : fallback

const schema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_BASE_URL: urlSchema.default('http://localhost:4000'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    TOKEN_ENCRYPTION_KEY: base64Key32,
    TOKEN_ENCRYPTION_KEY_ID: z.string().min(1),
    RETENTION_DAYS: z.coerce.number().int().min(1).default(180),

    // Google
    GOOGLE_PROJECT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
    GOOGLE_OAUTH_REDIRECT_URI: urlSchema,
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    GMAIL_SCOPES: z
      .string()
      .default('https://www.googleapis.com/auth/gmail.modify'),
    TASKS_SCOPES: z.string().default('https://www.googleapis.com/auth/tasks'),

    // Pub/Sub (push-only)
    PUSH_ENDPOINT_PATH: z.string().default('/api/pubsub/push'),
    PUBSUB_TOPIC: z.string().min(1),
    PUBSUB_SUBSCRIPTION: z.string().min(1),
    PUBSUB_OIDC_AUDIENCE: z.string().optional(),
    PUBSUB_SERVICE_ACCOUNT_EMAIL: z.string().email(),
    PUBSUB_PROJECT_NUMBER: z.string().optional(),
    PUBSUB_VERIFICATION_TOKEN: z.string().optional(),

    // OpenAI
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-4o'),
    OPENAI_API_BASE: z.string().optional(),

    // Twilio
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    TWILIO_DEFAULT_SMS_TO: z.string().optional(),
    ALLOW_DEFAULT_SMS_TO_IN_PROD: z.string().optional(),
    TWILIO_WEBHOOK_SECRET: z.string().optional(),

    // Feature flags
    FEATURE_ENABLE_SMS: z.string().optional(),
    FEATURE_ENABLE_TASKS: z.string().optional(),
    FEATURE_ENABLE_PUSH: z.string().optional(),
    FEATURE_ENABLE_CLASSIFIER: z.string().optional(),
  })
  .transform((env) => {
    const features = {
      sms: boolFromEnv(env.FEATURE_ENABLE_SMS, isDevelopment ? true : false),
      tasks: boolFromEnv(env.FEATURE_ENABLE_TASKS, isDevelopment ? true : false),
      push: boolFromEnv(env.FEATURE_ENABLE_PUSH, isDevelopment ? true : false),
      classifier: boolFromEnv(env.FEATURE_ENABLE_CLASSIFIER, isDevelopment ? true : false),
    }

    // Compute audience if not provided
    const cors = splitCsv(env.CORS_ORIGIN, ['http://localhost:5173'])
    const audience = env.PUBSUB_OIDC_AUDIENCE ?? `${env.APP_BASE_URL}${env.PUSH_ENDPOINT_PATH}`

    // Conditional requirements
    if (features.classifier && !env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when FEATURE_ENABLE_CLASSIFIER=true')
    }

    if (features.sms) {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        throw new Error('Twilio credentials required when FEATURE_ENABLE_SMS=true')
      }
      const hasService = !!env.TWILIO_MESSAGING_SERVICE_SID
      const hasFrom = !!env.TWILIO_FROM_NUMBER
      if ((hasService && hasFrom) || (!hasService && !hasFrom)) {
        throw new Error('Provide exactly one of TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER')
      }
      if (hasFrom) {
        e164.parse(env.TWILIO_FROM_NUMBER)
      }
      if (isProduction) {
        const allowDevTo = boolFromEnv(env.ALLOW_DEFAULT_SMS_TO_IN_PROD, false)
        if (env.TWILIO_DEFAULT_SMS_TO && !allowDevTo) {
          throw new Error('TWILIO_DEFAULT_SMS_TO set in production without ALLOW_DEFAULT_SMS_TO_IN_PROD=true')
        }
      } else if (env.TWILIO_DEFAULT_SMS_TO) {
        e164.parse(env.TWILIO_DEFAULT_SMS_TO)
      }
    }

    if (features.push) {
      // Ensure ADC in dev
      if (isDevelopment && !env.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required in development for ADC')
      }
    }

    // Pub/Sub OIDC expectations captured in config for verifier middleware
    const pubsubOidc = {
      issuer: 'https://accounts.google.com',
      audience,
      serviceAccountEmail: env.PUBSUB_SERVICE_ACCOUNT_EMAIL,
      projectNumber: env.PUBSUB_PROJECT_NUMBER,
      verificationToken: isDevelopment ? env.PUBSUB_VERIFICATION_TOKEN : undefined,
    }

    return {
      env: process.env.NODE_ENV || 'development',
      isDevelopment,
      isTest,
      isProduction,
      app: {
        port: env.PORT,
        baseUrl: env.APP_BASE_URL,
        corsOrigins: cors,
        logLevel: env.LOG_LEVEL,
      },
      db: {
        url: env.DATABASE_URL,
        retentionDays: env.RETENTION_DAYS,
      },
      security: {
        tokenKeyB64: env.TOKEN_ENCRYPTION_KEY,
        tokenKeyId: env.TOKEN_ENCRYPTION_KEY_ID,
      },
      google: {
        projectId: env.GOOGLE_PROJECT_ID,
        oauth: {
          clientId: env.GOOGLE_OAUTH_CLIENT_ID,
          clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
        },
        adcPath: env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: {
          gmail: env.GMAIL_SCOPES.split(',').map((s) => s.trim()),
          tasks: env.TASKS_SCOPES.split(',').map((s) => s.trim()),
        },
      },
      pubsub: {
        topic: env.PUBSUB_TOPIC,
        subscription: env.PUBSUB_SUBSCRIPTION,
        oidc: pubsubOidc,
        pushPath: env.PUSH_ENDPOINT_PATH,
        audience,
      },
      openai: {
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        apiBase: env.OPENAI_API_BASE,
      },
      twilio: {
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        fromNumber: env.TWILIO_FROM_NUMBER,
        defaultSmsTo: env.TWILIO_DEFAULT_SMS_TO,
        webhookSecret: env.TWILIO_WEBHOOK_SECRET,
      },
      features,
    }
  })

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // Aggregate readable errors
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Configuration validation failed:\n${issues}`)
}

export const config = Object.freeze(parsed.data)


