export interface Option {
  label: string;
  value: string;
}

export interface CustomSelectProps {
  options: Option[];
  placeholder?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}