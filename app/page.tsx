import { LandingHero } from "@/components/ui/LandingHero/LandingHero";
import { TeachersList } from "@/components/ui/TeachersList/TeachersList";

type TeacherRow = {
  id: number;
  name: string | null;
  email: string;
  bio: string | null;
  languages: string[];
  timezone: string;
  currency: string;
  avatarUrl: string | null;
  videoUrl: string | null;
  videoSource: string | null;
  fromPriceCents: number | null;
};

type ApiResponse = { teachers: TeacherRow[] };

const getTeachers = async (): Promise<TeacherRow[]> => {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/teachers`, {
    cache: "no-store",
  });

  // Fallback if NEXT_PUBLIC_APP_URL not set (local dev)
  if (!res.ok) {
    const localRes = await fetch("http://localhost:3000/api/teachers", { cache: "no-store" });
    const localData = (await localRes.json()) as ApiResponse;
    return localData.teachers ?? [];
  }

  const data = (await res.json()) as ApiResponse;
  return data.teachers ?? [];
};

const HomePage = async () => {
  const teachers = await getTeachers();

  return (
    <>
      <LandingHero
        titleMain={"Learn with great teachers.\nBook a lesson in minutes."}
        subtitle={"Pick a teacher, choose a time, pay with Stripe — done."}
        ctaLabel={"Start now"}
      />
      <TeachersList teachers={teachers} />
    </>
  );
};

export default HomePage;