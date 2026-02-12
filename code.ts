figma.showUI(__html__, { width: 360, height: 300 });

// Получаем список коллекций и отправляем в UI
async function sendCollectionsToUI() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const simplified = collections.map(col => ({ id: col.id, name: col.name }));
  figma.ui.postMessage({ type: "collections", data: simplified });
}

// Основной анализ
async function analyzeCollection(collectionId: string, showAll: boolean) {
  const allVariables = await figma.variables.getLocalVariablesAsync();
  // Асинхронно собираем usedIds для всех объектов на странице
  const usedIds = new Set<string>();
  const nodes = figma.currentPage.children;
  for (const node of nodes) {
    await new Promise(resolve => {
      setTimeout(() => {
        scanNodeAsync(node, usedIds);
        resolve(null);
      }, 0);
    });
  }

  const collectionVariables = allVariables.filter(
    v => v.variableCollectionId === collectionId
  );
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
  const message =
    unused.length === 0
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

function scanNodeAsync(node: SceneNode, usedIds: Set<string>) {
  // Проверяем boundVariables на уровне узла
  if ("boundVariables" in node && node.boundVariables) {
    for (const key in node.boundVariables) {
      const bound = (node.boundVariables as any)[key];
      const items = Array.isArray(bound) ? bound : [bound];
      
      for (const item of items) {
        if (item && item.id) {
          usedIds.add(item.id);
        }
      }
    }
  }
  
  // Проверяем fills
  if ("fills" in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.boundVariables?.color?.id) {
        usedIds.add((fill as any).boundVariables.color.id);
      }
    }
  }
  
  // Проверяем strokes
  if ("strokes" in node && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke.boundVariables?.color?.id) {
        usedIds.add((stroke as any).boundVariables.color.id);
      }
    }
  }
  
  // Рекурсивно проверяем детей
  if ("children" in node) {
    for (const child of node.children) {
      scanNodeAsync(child, usedIds);
    }
  }
}

// Проверка сломанных связей с переменными в выделенных узлах
async function checkBrokenVariables() {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify("❌ Выберите хотя бы один объект");
    figma.closePlugin();
    return;
  }

  const allVariableIds = new Set<string>();
  const brokenLinks: Array<{ nodeName: string; nodeId: string; variableId: string; property: string }> = [];

  function collectVariableIds(node: SceneNode) {
    // Собираем все ID переменных из boundVariables на уровне узла
    if ("boundVariables" in node && node.boundVariables) {
      for (const key in node.boundVariables) {
        const bound = (node.boundVariables as any)[key];
        const items = Array.isArray(bound) ? bound : [bound];
        
        for (const item of items) {
          if (item && item.id) {
            allVariableIds.add(item.id);
            brokenLinks.push({
              nodeName: node.name,
              nodeId: node.id,
              variableId: item.id,
              property: key
            });
          }
        }
      }
    }

    // Собираем из fills
    if ("fills" in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.boundVariables?.color?.id) {
          const varId = (fill as any).boundVariables.color.id;
          allVariableIds.add(varId);
          brokenLinks.push({
            nodeName: node.name,
            nodeId: node.id,
            variableId: varId,
            property: "fills.color"
          });
        }
      }
    }

    // Собираем из strokes
    if ("strokes" in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.boundVariables?.color?.id) {
          const varId = (stroke as any).boundVariables.color.id;
          allVariableIds.add(varId);
          brokenLinks.push({
            nodeName: node.name,
            nodeId: node.id,
            variableId: varId,
            property: "strokes.color"
          });
        }
      }
    }

    // Рекурсивно проверяем детей
    if ("children" in node) {
      for (const child of node.children) {
        collectVariableIds(child);
      }
    }
  }

  // Сканируем все выделенные узлы
  for (const node of selection) {
    collectVariableIds(node);
  }

  // Получаем список всех реально существующих локальных переменных
  const allLocalVariables = await figma.variables.getLocalVariablesAsync();
  const localVariableIds = new Set(allLocalVariables.map(v => v.id));

  // Проверяем какие переменные действительно сломаны
  const trulyBrokenIds = new Set<string>();
  const brokenDetails = new Map<string, string>(); // ID -> причина
  
  for (const varId of allVariableIds) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      
      if (!variable) {
        trulyBrokenIds.add(varId);
        brokenDetails.set(varId, "Переменная не найдена");
        continue;
      }
      
      // Проверяем локальные переменные - если переменная не remote и её нет в списке локальных, значит она удалена
      if ('remote' in variable && (variable as any).remote === false) {
        if (!localVariableIds.has(varId)) {
          trulyBrokenIds.add(varId);
          brokenDetails.set(varId, `"${variable.name}" (локальная переменная удалена)`);
          continue;
        }
      }
      
      // Проверяем, удалена ли коллекция переменной
      let collectionName = "Unknown";
      try {
        const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
        if (!collection) {
          trulyBrokenIds.add(varId);
          brokenDetails.set(varId, `"${variable.name}" (коллекция удалена)`);
          continue;
        }
        collectionName = collection.name;
      } catch (e) {
        trulyBrokenIds.add(varId);
        brokenDetails.set(varId, `"${variable.name}" (коллекция недоступна)`);
        continue;
      }
      
      // Проверяем remote статус - если переменная из удаленной библиотеки
      if ('remote' in variable && (variable as any).remote === true) {
        if ('key' in variable && !(variable as any).key) {
          trulyBrokenIds.add(varId);
          brokenDetails.set(varId, `"${variable.name}" (библиотека отключена)`);
          continue;
        }
      }
      
      // Проверяем значения переменной для всех modes
      let hasBrokenAlias = false;
      
      for (const modeId in variable.valuesByMode) {
        const value = variable.valuesByMode[modeId];
        
        // Проверяем если значение - это алиас
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'VARIABLE_ALIAS') {
          const aliasId = (value as any).id;
          try {
            const aliasedVar = await figma.variables.getVariableByIdAsync(aliasId);
            if (!aliasedVar) {
              hasBrokenAlias = true;
              break;
            }
          } catch (e) {
            hasBrokenAlias = true;
            break;
          }
        }
      }
      
      if (hasBrokenAlias) {
        trulyBrokenIds.add(varId);
        brokenDetails.set(varId, `"${variable.name}" из "${collectionName}" (разорванный алиас)`);
      }
      
    } catch (e) {
      trulyBrokenIds.add(varId);
      brokenDetails.set(varId, `Ошибка доступа: ${(e as Error).message}`);
    }
  }

  // Фильтруем только действительно сломанные ссылки
  const trulyBrokenLinks = brokenLinks.filter(link => trulyBrokenIds.has(link.variableId));

  // Выводим результаты
  const text = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  
  if (trulyBrokenLinks.length === 0) {
    text.characters = "✅ Разорванных связей не найдено";
    text.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.8, b: 0.2 } }];
  } else {
    // Группируем по узлам
    const grouped = new Map<string, Map<string, Set<string>>>();
    
    for (const link of trulyBrokenLinks) {
      if (!grouped.has(link.nodeName)) {
        grouped.set(link.nodeName, new Map());
      }
      
      const nodeMap = grouped.get(link.nodeName)!;
      if (!nodeMap.has(link.property)) {
        nodeMap.set(link.property, new Set());
      }
      nodeMap.get(link.property)!.add(link.variableId);
    }
    
    let message = `🔴 Найдено ${trulyBrokenIds.size} сломанных переменных в ${grouped.size} объектах\n\n`;
    
    // Сначала выводим детали сломанных переменных
    message += `🔍 Детали:\n`;
    for (const id of trulyBrokenIds) {
      const detail = brokenDetails.get(id) || "Неизвестная проблема";
      message += `• ${detail}\n`;
    }
    
    // Затем выводим объекты со сломанными связями
    message += `\n📦 Объекты со сломанными связями:\n`;
    for (const [nodeName, propsMap] of grouped) {
      message += `\n• ${nodeName}\n`;
      for (const [property, varIds] of propsMap) {
        const displayProp = property.replace('boundVariables.', '').replace('.boundVariables', '');
        message += `  — ${displayProp}: ${varIds.size} ${varIds.size === 1 ? 'связь' : varIds.size < 5 ? 'связи' : 'связей'}\n`;
      }
    }
    
    text.characters = message;
    text.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.3, b: 0.3 } }];
  }
  
  text.x = 0;
  text.y = 0;
  text.fontSize = 12;
  figma.currentPage.appendChild(text);
  figma.viewport.scrollAndZoomIntoView([text]);
  figma.closePlugin();
}

figma.ui.onmessage = (msg) => {
  if (msg.type === "collectionSelected") {
    analyzeCollection(msg.collectionId, msg.showAll);
  } else if (msg.type === "checkBrokenVariables") {
    checkBrokenVariables();
  }
};

sendCollectionsToUI();
