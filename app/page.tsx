import { LandingHero } from "@/components/ui/LandingHero/LandingHero";
import { TeachersList } from "@/components/ui/TeachersList/TeachersList";
import { getTeachers } from "@/lib/teachers/getTeachers";

const HomePage = async () => {
  const teachers = await getTeachers();
  console.log(process.env.POSTGRES_URL)
  if (teachers instanceof Error) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Teachers</h1>
        <p>Error loading teachers: {teachers.message}</p>
      </div>
    );
  }
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