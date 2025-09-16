export interface SkillCategory {
  id: number;
  category: string;
  items: SkillItem[];
}

interface SkillItem {
  name: string;
  color: string;
}
