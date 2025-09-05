const catalogProductsData = {
    products: [
        {
            sku: "AUT-FTR-URA-ATZ12_T--4320-4971-80--2SEC", // стоковый юнит, чтобы можно было сверять с сайтом
            name: "Автотопливозаправщик АТЗ-12 двухсекционный на шасси Урал-М 4320-4971-80", //имя
            price: 9200000.0,  // ценник
            urlSite: "https://gkvertikal.ru/avtotoplivozapravshchik-atz-12-dvuhsekcionnyj-na-shassi-ural-m-4320-4971-80/", // будет использовать кнопка
            urlSiteImage: "https://gkvertikal.ru/image/cache/catalog/avtotransport/atz/ATZ12_T--4320-4971-80--2SEC/WhatsApp%20Image%202025-07-22%20at%2010.25.44%20(1)-570x570.png", // для вывода в карточке
        },
        {
            sku: "AUT-PWT-URA-ACPT-10_T--4320-6951-72--1SEC", // стоковый юнит, чтобы можно было сверять с сайтом
            name: "Автоцистерны для питьевой воды АЦПТ-10м3 на шасси Урал 4320-6951-72", //имя
            price: 1000000.0,  // ценник
            urlSite: "https://gkvertikal.ru/avtocisterny-dlya-pitevoj-vody-acpt-10m3-na-shassi-ural-4320-6951-72/", // будет использовать кнопка
            urlSiteImage: "https://gkvertikal.ru/image/cache/catalog/avtotransport/avtotsisterna/ACPT/e826352c-0e4b-45e5-91f1-53cbdd1d3cc9-570x570.png", // для вывода в карточке
        }   
    ]
}

module.exports = catalogProductsData;