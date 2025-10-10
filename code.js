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
    // Асинхронно собираем usedIds для всех объектов на странице
    const usedIds = new Set();
    const nodes = figma.currentPage.children;
    for (const node of nodes) {
        await new Promise(resolve => {
            setTimeout(() => {
                scanNodeAsync(node, usedIds);
                resolve(null);
            }, 0);
        });
    }
    const collectionVariables = allVariables.filter(v => v.variableCollectionId === collectionId);
    // Принудительно считаем font-family переменные использованными
    const fontNameVariableIds = collectionVariables
        .filter(v => v.name.toLowerCase().includes("font-family"))
        .map(v => v.id);
    fontNameVariableIds.forEach(id => usedIds.add(id));
    if (showAll) {
        const sorted = collectionVariables
            .map(v => v.name)
            .sort((a, b) => a.localeCompare(b));
        const allMessage = `📦 Все переменные коллекции:\n• ${sorted.join("\n• ")}`;
        const allText = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        allText.characters = allMessage;
        allText.x = 0;
        allText.y = 0;
        allText.fills = [{ type: 'SOLID', color: { r: 0.58, g: 0.58, b: 0.58 } }]; // #949494
        figma.currentPage.appendChild(allText);
    }
    const unused = collectionVariables.filter(v => !usedIds.has(v.id));
    const message = unused.length === 0
        ? "✅ Все переменные используются"
        : `🟡 Неиспользуемые переменные:\n• ${unused.map(v => v.name).join("\n• ")}`;
    const text = figma.createText();
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    text.characters = message;
    text.x = 0;
    text.y = 0;
    text.fills = [{ type: 'SOLID', color: { r: 0.58, g: 0.58, b: 0.58 } }]; // #949494
    figma.currentPage.appendChild(text);
    figma.viewport.scrollAndZoomIntoView([text]);
    figma.closePlugin();
}
function scanNodeAsync(node, usedIds) {
    const typographyProps = [
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "paragraphSpacing"
    ];
    if ("boundVariables" in node && node.boundVariables) {
        for (const key in node.boundVariables) {
            const bound = node.boundVariables[key];
            if (bound) {
                usedIds.add(bound.id);
            }
            for (const prop of typographyProps) {
                const items = Array.isArray(node.boundVariables[prop]) ? node.boundVariables[prop] : [node.boundVariables[prop]];
                if (Array.isArray(items)) {
                    for (const item of items) {
                        if (item) {
                            usedIds.add(item.id);
                        }
                    }
                }
            }
        }
    }
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
    if ("children" in node) {
        for (const child of node.children) {
            scanNodeAsync(child, usedIds);
        }
    }
}
figma.ui.onmessage = (msg) => {
    if (msg.type === "collectionSelected") {
        analyzeCollection(msg.collectionId, msg.showAll);
    }
};
sendCollectionsToUI();
