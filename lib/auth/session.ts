import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NewUser } from "@/lib/db/schema";

const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const SALT_ROUNDS = 10;

export async function hashPassword(password: string) {
  return hash(password, SALT_ROUNDS);
}

export async function comparePasswords(plainTextPassword: string, hashedPassword: string) {
  return compare(plainTextPassword, hashedPassword);
}

type SessionData = {
  user: { id: number; email?: string | null };
  expires: string;
};

export async function signToken(payload: SessionData) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1 day from now")
    .sign(key);
}

export async function verifyToken(input: string) {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ["HS256"],
  });
  return payload as SessionData;
}

export async function getSession() {
  const store = await cookies();
  const token = store.get("session")?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function setSession(user: NewUser) {
  const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const session: SessionData = {
    user: { id: user.id!, email: (user as any).email ?? null },
    expires: expiresInOneDay.toISOString(),
  };

  const encryptedSession = await signToken(session);

  const isProd = process.env.NODE_ENV === "production";
  const store = await cookies();

  store.set("session", encryptedSession, {
    expires: expiresInOneDay,
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;

  return {
    id: Number(session.user.id),
    email: session.user.email ?? null,
  };
}