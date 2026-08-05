export const getAge = () => {
  const birthdayStr = process.env.NEXT_PUBLIC_BIRTHDAY;
  if (!birthdayStr) return null;

  const birthday = new Date(birthdayStr);
  if (isNaN(birthday.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();

  const m = today.getMonth() - birthday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthday.getDate())) {
    age--;
  }

  return age;
};
