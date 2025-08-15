import ThemeToggle from "@/Components/UI/Buttons/ThemeToggle";

const HomePage = () => {
  return (
    <main>
      <div className="absolute top-2 left-2">
        <ThemeToggle />
      </div>
      <div className="min-h-screen flex justify-center items-center bg-primary text-Gold">
        Hello World
      </div>
    </main>
  );
};

export default HomePage;
