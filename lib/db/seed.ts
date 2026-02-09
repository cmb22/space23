import { stripe } from '../payments/stripe';
import { db } from './drizzle';
import { users, teams, teamMembers } from './schema';
import { hashPassword } from '@/lib/auth/session';

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const baseProduct = await stripe.products.create({
    name: 'Base',
    description: 'Base subscription plan',
  });

  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800, // $8 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  const plusProduct = await stripe.products.create({
    name: 'Plus',
    description: 'Plus subscription plan',
  });

  await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 1200, // $12 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  console.log('Stripe products and prices created successfully.');
}

async function seed() {
  // Create two product roles
  const teacherEmail = 'teacher+1@test.com';
  const studentEmail = 'student+1@test.com';
  const password = 'admin123';

  const teacherPasswordHash = await hashPassword(password);
  const studentPasswordHash = await hashPassword(password);

  // 1) Teacher user (PRODUCT ROLE)
  const [teacher] = await db
    .insert(users)
    .values([
      {
        email: teacherEmail,
        passwordHash: teacherPasswordHash,
        role: 'teacher', // <-- product role
      },
    ])
    .returning();

  // 2) Student user (PRODUCT ROLE)
  await db.insert(users).values([
    {
      email: studentEmail,
      passwordHash: studentPasswordHash,
      role: 'student', // <-- product role
    },
  ]);

  console.log('Teacher + Student users created.');

  // 3) Create a team (SaaS-starter concept)
  const [team] = await db
    .insert(teams)
    .values({
      name: 'Test Team',
    })
    .returning();

  // 4) Teacher is owner in the team (TEAM ROLE)
  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: teacher.id,
    role: 'owner', // <-- team role
  });

  await createStripeProducts();
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
