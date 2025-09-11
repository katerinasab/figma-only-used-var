"use strict";
figma.showUI(__html__, { width: 360, height: 300 });
// Получаем список коллекций и отправляем в UI
async function sendCollectionsToUI() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const simplified = collections.map(col => ({ id: col.id, name: col.name }));
    figma.ui.postMessage({ type: "collections", data: simplified });
}
// Основной анализ
async function analyzeCollection(collectionId, showAll) {
    const allVariables = await figma.variables.getLocalVariablesAsync();
    console.log("🔍 Локальные переменные:");
    allVariables.forEach(variable => {
        console.log(`• ${variable.name} (${variable.id})`);
    });
    const usedIds = findUsedVariableIdsInPage(figma.currentPage);
    console.log("🔍 Используемые переменные:");
    usedIds.forEach(variable => {
        console.log(`• $(${variable})`);
    });
    const collectionVariables = allVariables.filter(v => v.variableCollectionId === collectionId);
    // Принудительно считаем font-family переменные использованными
    const fontNameVariableIds = collectionVariables
        .filter(v => v.name.toLowerCase().includes("font-family"))
        .map(v => v.id);
    fontNameVariableIds.forEach(id => usedIds.add(id));
    // Текст со всеми переменными коллекции
    console.log("showAll=");
    console.log(showAll);
    if (showAll) {
        const categoryOrder = ["color", "layout", "typography", "borders", "box-shadow", "opacity", "icon"];
        const subcategoryOrder = {
            color: ["bg", "content", "icon", "text", "border", "trigger"],
            layout: [
                "inner-box", "outer-box", "text-box", "content-box", "icon-box", "icon-wrapper",
                "left", "right", "top", "bottom", "horizontal", "vertical", "gap",
                "width", "height", "sizing", "max-height", "min-height", "max-width", "min-width"
            ],
            typography: ["font-family", "font-size", "font-weight", "line-height", "letter-spacing"],
            borders: ["border-radius", "border-width"],
            icon: ["set", "size"],
        };
        const stateOrder = ["rest", "hovered", "active", "selected", "read-only", "disabled", "focused"];
        const sizeOrder = ["small", "medium", "large"];
        function getSortKey(name) {
            var _a, _b, _c;
            const parts = name.split("/");
            const category = parts.find(p => categoryOrder.includes(p)) || "";
            const sub = ((_a = subcategoryOrder[category]) === null || _a === void 0 ? void 0 : _a.find(s => parts.includes(s))) || "";
            const state = stateOrder.find(s => parts.includes(s)) || "";
            const size = sizeOrder.find(s => parts.includes(s)) || "";
            return [
                categoryOrder.indexOf(category),
                (_c = (_b = subcategoryOrder[category]) === null || _b === void 0 ? void 0 : _b.indexOf(sub)) !== null && _c !== void 0 ? _c : 99,
                sizeOrder.indexOf(size),
                stateOrder.indexOf(state),
                name
            ];
        }
        const sorted = collectionVariables
            .map(v => v.name)
            .sort((a, b) => {
            const aKey = getSortKey(a);
            const bKey = getSortKey(b);
            for (let i = 0; i < Math.max(aKey.length, bKey.length); i++) {
                const aPart = aKey[i] || "";
                const bPart = bKey[i] || "";
                if (aPart !== bPart) {
                    return String(aPart).localeCompare(String(bPart));
                }
            }
            return 0;
        });
        const allMessage = `📦 Все переменные (сортировка по структуре):\n• ${sorted.join("\n• ")}`;
        const allText = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        allText.characters = allMessage;
        allText.x = 100;
        allText.y = 100;
        figma.currentPage.appendChild(allText);
    }
    // 2. Теперь фильтруем как обычно
    const unused = collectionVariables.filter(v => !usedIds.has(v.id));
    const message = unused.length === 0
        ? "✅ Все переменные используются"
        : `🟡 Неиспользуемые переменные:\n• ${unused.map(v => v.name).join("\n• ")}`;
    const text = figma.createText();
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    text.characters = message;
    text.x = 100;
    text.y = 100;
    figma.currentPage.appendChild(text);
    figma.viewport.scrollAndZoomIntoView([text]);
    figma.closePlugin();
}
// 🚀 Новая улучшенная функция поиска использованных переменных
function findUsedVariableIdsInPage(page) {
    const usedIds = new Set();
    function scanNode(node) {
        const typographyProps = [
            "fontSize",
            "fontWeight",
            "lineHeight",
            "letterSpacing",
            "paragraphSpacing"
        ];
        // 1. Стандартные boundVariables (spacing, number, etc.)
        if ("boundVariables" in node && node.boundVariables) {
            console.log(node.boundVariables);
            console.log("----");
            for (const key in node.boundVariables) {
                console.log(key);
                const bound = node.boundVariables[key];
                console.log("bound " + bound);
                if (bound) {
                    usedIds.add(bound.id);
                }
                for (const prop of typographyProps) {
                    const items = Array.isArray(node.boundVariables[prop]) ? node.boundVariables[prop] : [node.boundVariables[prop]];
                    if (Array.isArray(items)) {
                        for (const item of items) {
                            console.log(item);
                            if (item) {
                                usedIds.add(item.id);
                            }
                        }
                    }
                }
                /*         const bv: any = (node as any).boundVariables;
                          if (!bv || !("fontWeight" in bv) || !bv["fontWeight"]) return [];
                
                          // Нормализуем к массиву (в Figma это может быть объект или массив объектов)
                          const items = Array.isArray(bv["fontWeight"]) ? bv["fontWeight"] : [bv["fontWeight"]];
                console.log(items);
                        console.log("Try to get font size");
                        const fontSizeVar = (node.boundVariables as any)[key].fontSize;
                        console.log(fontSizeVar);
                        if (fontSizeVar) {
                          usedIds.add(fontSizeVar.id);
                          console.log("Font size variable ID:", fontSizeVar.id);
                          console.log("Font size variable type:", fontSizeVar.type);
                        } */
            }
            // B. Типографические свойства — для надёжности
            /*    const typographyProps = [
                 "fontSize",
                 "fontWeight",
                 "lineHeight",
                 "letterSpacing",
                 "paragraphSpacing"
               ]; */
            /*     for (const prop of typographyProps) {
                  const variable = (node.boundVariables as any)[prop];
                  if (variable) {
                    usedIds.add(variable.id);
                  }
                } */
        }
        /*    if ("fontSize" in node && Array.isArray(node.fontSize)) {
             for (const fontSizeItem of node.fontSize) {
               if (
                 "boundVariables" in fontSizeItem &&
                 fontSizeItem.boundVariables &&
                 "color" in fontSizeItem.boundVariables &&
                 fontSizeItem.boundVariables.color
               ) {
                 usedIds.add((fontSizeItem as any).boundVariables.color.id);
               }
             }
           } */
        // 2. Color через fills
        if ("fills" in node && Array.isArray(node.fills)) {
            for (const fill of node.fills) {
                if ("boundVariables" in fill &&
                    fill.boundVariables &&
                    "color" in fill.boundVariables &&
                    fill.boundVariables.color) {
                    usedIds.add(fill.boundVariables.color.id);
                }
            }
        }
        // 3. Color через strokes
        if ("strokes" in node && Array.isArray(node.strokes)) {
            for (const stroke of node.strokes) {
                if ("boundVariables" in stroke &&
                    stroke.boundVariables &&
                    "color" in stroke.boundVariables &&
                    stroke.boundVariables.color) {
                    usedIds.add(stroke.boundVariables.color.id);
                }
            }
        }
        // Рекурсивно сканируем дочерние элементы
        if ("children" in node) {
            for (const child of node.children) {
                scanNode(child);
            }
        }
    }
    for (const node of page.children) {
        scanNode(node);
    }
    return usedIds;
}
// UI взаимодействие
figma.ui.onmessage = (msg) => {
    if (msg.type === "collectionSelected") {
        analyzeCollection(msg.collectionId, msg.showAll);
    }
};
sendCollectionsToUI();
