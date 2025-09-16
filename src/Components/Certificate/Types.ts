export type CertificateType = {
  id: number;
  title: string;
  description: string;
  teacher: string;
  teacherLink: string;
  score: string;
  institute: string;
  instituteLink: string;
  filePath: string;
  date: string;
};

export type LabelProps = {
  children: React.ReactNode;
  className?: string;
};
