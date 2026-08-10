export interface SkillCategory {
  id: number;
  category: string;
  items: SkillItem[];
}

interface SkillItem {
  id: number;
  name: string;
  color: string;
}
