export const Num = (val: any) => {
  const num = Number(val || 0);
  if (typeof num !== "number" || isNaN(num)) return 0;
  return num;
};
