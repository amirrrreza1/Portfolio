import Header from "./Header/Header";

const MainLayout = ({ children }: any) => {
  return (
    <main>
      <Header />
      {children}
    </main>
  );
};

export default MainLayout;
