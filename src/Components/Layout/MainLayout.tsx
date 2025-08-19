import Footer from "./Footer/Footer";
import Header from "./Header/Header";

const MainLayout = ({ children }: any) => {
  return (
    <main className="flex flex-col items-center justify-between min-h-screen">
      <Header />
      {children}
      <Footer />
    </main>
  );
};

export default MainLayout;
