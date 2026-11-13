export const mealTimes = {
  breakfast: "7:30–9:00 AM (Mon–Fri) · 8:30–10:00 AM (Sat–Sun)",
  lunch: "12:30–2:00 PM",
  snacks: "5:00–6:00 PM",
  dinner: "7:30–9:30 PM",
};

export const messMenu = [
  {
    day: "MONDAY",
    meals: [
      "Poha jalebi · 2 bananas / 2 eggs · Chai/dudh · Sprouts · Bread jam · Corn flakes",
      "Rajma · Rice · Cucumber raita · Roti · Ghee · Dal · Achar · Salad",
      "Dhokla / Pani puri · Tomato chutney · Green chutney · Tea",
      "Bhindi masala · Ghee · Roti · Rice · Dal · Achar · Salad",
    ],
  },
  {
    day: "TUESDAY",
    meals: [
      "Sandwich · Chutney · 2 bananas · Chai/dudh · Sprouts · Corn flakes",
      "Soya chunks · Rice · Ghee · Roti · Dal makhani · Dahi · Achar · Salad",
      "Aloo tikki chaat · Tomato chutney · Green chutney · Tea",
      "Puri · Aloo sabzi · Rice · Dal · Achar · Salad · Kheer",
    ],
  },
  {
    day: "WEDNESDAY",
    meals: [
      "Uttapam · Chutney · 2 bananas / 2 eggs · Chai/dudh · Sprouts · Bread jam · Corn flakes",
      "Chole · Rice · Ghee · Roti · Dal · Dahi · Achar · Salad",
      "Pakora / bhajiya · Tomato chutney · Green chutney · Tea",
      "Butter paneer masala / Palak paneer / Egg curry · Jeera rice · Dal · Roti · Ghee · Achar · Salad · Custard / halwa",
    ],
  },
  {
    day: "THURSDAY",
    meals: [
      "Methi paratha / Mooli and gobhi paratha · Chutney · 2 bananas / 2 eggs · Chai/dudh · Sprouts · Bread jam · Corn flakes",
      "Sev tamatar / Baigan masala · Rice · Ghee · Roti · Dal · Chaas · Achar · Salad",
      "2 samosa / 2 kachori · Green chutney · Tea",
      "Gobhi / seasonal veg · Rice · Roti · Dal makhani · Dahi · Achar · Salad",
    ],
  },
  {
    day: "FRIDAY",
    meals: [
      "Sambar vada · 2 bananas / 2 eggs · Chai/dudh · Sprouts · Bread jam · Corn flakes",
      "Aloo methi / Matar · Roti · Ghee · Dal · Dahi · Achar · Salad",
      "Bhel · Onion · Tomato chutney · Tea",
      "Chole bhature · Imli chutney · Rice · Achar · Salad · Gulab jamun",
    ],
  },
  {
    day: "SATURDAY",
    meals: [
      "Aloo paratha · Dahi · 2 bananas · Chai/dudh · Sprouts · Corn flakes",
      "Kale chane · Rice · Roti · Ghee · Dal · Dahi · Achar · Salad",
      "Pasta · Tea",
      "Veg biryani · Fryums · Mint chutney · Salad",
    ],
  },
  {
    day: "SUNDAY",
    meals: [
      "Dosa · Chutney · Sambar · 2 bananas / 2 eggs · Chai/dudh · Sprouts · Bread jam · Corn flakes",
      "Kadhi pakode · Rice · Roti · Ghee · Masala aloo · Achar · Salad",
      "Vada pav · Green chutney · Tea",
      "Kadhai paneer / Kadhai chicken · Pulao / Jeera rice · Roti · Ghee · Achar · Salad",
    ],
  },
] as const;

export const menuMealLabels = ["Breakfast", "Lunch", "Snacks", "Dinner"] as const;

export function getIndiaWeekday() {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date()).toUpperCase();
  return messMenu.findIndex((day) => day.day === weekday);
}
