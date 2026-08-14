export interface SkillCategory {
  id: string | number;
  category: string;
  items: SkillItem[];
}

interface SkillItem {
  id: string | number;
  name: string;
  color: string;
}
