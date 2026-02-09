import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('student'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});


export const teacherProfiles = pgTable("teacher_profiles", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),

  bio: text("bio"),
  languages: text("languages").array().notNull().default([]),

  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Berlin"),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),

  qualifications: text("qualifications"),

  avatarUrl: text("avatar_url"),
  videoUrl: text("video_url"),
  videoSource: varchar("video_source", { length: 16 }).notNull().default("local"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const lessonOffers = pgTable("lesson_offers", {
  id: serial("id").primaryKey(),

  teacherId: integer("teacher_id")
    .notNull()
    .references(() => users.id),

  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),

  // ✅ DB: varchar(3)
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),

  // ✅ DB: integer 1/0 (nicht boolean)
  isActive: integer("is_active").notNull().default(1),

  // ✅ DB: timestamp without time zone
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const availabilityRules = pgTable("availability_rules", {
  id: serial("id").primaryKey(),

  teacherId: integer("teacher_id")
    .notNull()
    .references(() => users.id),

  // 0=Sun..6=Sat
  weekday: integer("weekday").notNull(),

  // minutes since midnight
  startMin: integer("start_min").notNull(),
  endMin: integer("end_min").notNull(),

  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Berlin"),

  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const availabilityOverrides = pgTable('availability_overrides', {
  id: serial('id').primaryKey(),

  teacherId: integer('teacher_id')
    .notNull()
    .references(() => users.id),

  // UTC time range (like your bookings)
  startUtc: timestamp('start_utc', { withTimezone: true }).notNull(),
  endUtc: timestamp('end_utc', { withTimezone: true }).notNull(),

  // add = makes available, block = removes availability
  kind: varchar('kind', { length: 10 }).notNull(), // 'add' | 'block'

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const entitlements = pgTable("entitlements", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id),

  product: varchar("product", { length: 32 }).notNull(),
  // e.g. "LESSONS", "AI_CHAT"

  status: varchar("status", { length: 16 }).notNull(),
  // "active" | "canceled" | "expired"

  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),

  teacherId: integer("teacher_id").notNull().references(() => users.id),
  studentId: integer("student_id").notNull().references(() => users.id),

  startUtc: timestamp("start_utc", { withTimezone: true }).notNull(),
  endUtc: timestamp("end_utc", { withTimezone: true }).notNull(),

  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),

  status: varchar("status", { length: 16 }).notNull().default("pending"),
  // pending | paid | canceled | refunded

  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});


export const teacherAvailability = pgTable("teacher_availability", {
  id: serial("id").primaryKey(),

  teacherId: integer("teacher_id")
    .notNull()
    .references(() => users.id),

  // UTC range
  startUtc: timestamp("start_utc", { withTimezone: true }).notNull(),
  endUtc: timestamp("end_utc", { withTimezone: true }).notNull(),

  // optional: "manual" | "rule" (kannst du später nutzen)
  source: varchar("source", { length: 16 }).notNull().default("manual"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}
