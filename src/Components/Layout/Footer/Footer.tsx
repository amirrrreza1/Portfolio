const Footer = () => {
  return (
    <>
      <footer className="w-full bg-primary border-t border-secondary/20">
        <div className="flex flex-wrap-reverse justify-between items-center py-2 Container text-secondary text-[13px]">
          <p className="FooterSmallText">
            © {new Date().getFullYear()} Amirreza Azarioun | All rights reserved
          </p>
          <p className="FooterSmallText">Made with ❤️ by Amirreza</p>
        </div>
      </footer>
    </>
  );
};

export default Footer;
