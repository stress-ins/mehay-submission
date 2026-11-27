export type PartCategoryPhoto = {
  src: string;
  alt: string;
  role: "category-illustration";
  label: string;
  credit: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
};

const categoryPhotos: { match: RegExp; photo: PartCategoryPhoto }[] = [
  {
    match: /масля\w*.{0,20}фильтр|фильтр.{0,20}масля\w*/i,
    photo: {
      src: "/parts/category/oil-filter.jpg",
      alt: "Масляный фильтр, установленный на автомобильном двигателе",
      role: "category-illustration",
      label: "Иллюстрация категории · фото конкретного товара не подтверждено",
      credit: "Dvortygirl / Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Engine_oil_filter.JPG",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    },
  },
  {
    match: /тормоз\w*.{0,24}(?:диск|колодк)|(?:диск|колодк).{0,24}тормоз\w*/i,
    photo: {
      src: "/parts/category/brake-disc.jpg",
      alt: "Тормозной диск и суппорт на колесе автомобиля",
      role: "category-illustration",
      label: "Иллюстрация категории · фото конкретного товара не подтверждено",
      credit: "Shixart1985 / Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Rusty_brake_disc_and_caliper_shown_on_a_vehicle_parked_on_gravel_near_a_road.jpg",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    },
  },
  {
    match: /аккумулятор\w*|акб|автомобильн\w*.{0,15}батаре|\bbattery\b/i,
    photo: {
      src: "/parts/category/battery.jpg",
      alt: "Свинцово-кислотная автомобильная аккумуляторная батарея",
      role: "category-illustration",
      label: "Иллюстрация категории · фото конкретного товара не подтверждено",
      credit: "Shaddack / Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Photo-CarBattery.jpg",
      license: "Public domain",
      licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-self",
    },
  },
];

export function categoryPhotoForPart(partName: string): PartCategoryPhoto | null {
  return categoryPhotos.find(({ match }) => match.test(partName))?.photo || null;
}
