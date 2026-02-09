
import * as t from '@babel/types';

export const astToValue = (node: t.Node | null | undefined, bindings: Record<string, any> = {}): any => {
    if (!node) return undefined;
    if (t.isStringLiteral(node)) return node.value;
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isBooleanLiteral(node)) return node.value;
    if (t.isNullLiteral(node)) return null;
    if (t.isIdentifier(node)) {
        if (node.name === 'undefined') return undefined;
        if (Object.prototype.hasOwnProperty.call(bindings, node.name)) return bindings[node.name];
    }
    if (t.isArrayExpression(node)) return node.elements.map((e) => (e ? astToValue(e, bindings) : null));
    if (t.isObjectExpression(node)) {
        return node.properties.reduce((acc, prop) => {
            if (t.isObjectProperty(prop)) {
                const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
                if (key) acc[key] = astToValue(prop.value as t.Node, bindings);
            } else if (t.isSpreadElement(prop)) {
                const spreadVal = astToValue(prop.argument, bindings);
                if (spreadVal && typeof spreadVal === 'object') {
                    Object.assign(acc, spreadVal);
                }
            }
            return acc;
        }, {} as any);
    }
    if (t.isTemplateLiteral(node)) {
        let result = '';
        for (let i = 0; i < node.quasis.length; i++) {
            const quasi = node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
            result += quasi;
            if (i < node.expressions.length) {
                const exprVal = astToValue(node.expressions[i] as t.Node, bindings);
                if (exprVal === undefined) return undefined;
                result += String(exprVal);
            }
        }
        return result;
    }
    if (t.isBinaryExpression(node) && node.operator === '+') {
        const left = astToValue(node.left, bindings);
        const right = astToValue(node.right, bindings);
        if (typeof left === 'string' && typeof right === 'string') {
            return left + right;
        }
    }
    if (t.isMemberExpression(node)) {
        const object = astToValue(node.object, bindings);
        const property = node.property;

        if (t.isIdentifier(property)) {
            if (typeof object === 'object' && object !== null && property.name in object) {
                return object[property.name];
            }
            if (typeof object === 'string' && property.name === 'name') {
                return object;
            }
            if (object === undefined && property.name === 'name') {
                if (t.isIdentifier(node.object)) {
                    return node.object.name;
                }
                if (t.isMemberExpression(node.object) && t.isIdentifier(node.object.property)) {
                    return node.object.property.name;
                }
            }
        }
        if (t.isStringLiteral(property)) {
            if (typeof object === 'object' && object !== null && property.value in object) {
                return object[property.value];
            }
        }
    }
    if (t.isCallExpression(node)) {
        const merged: any = {};
        let foundObject = false;
        for (const arg of node.arguments) {
            if (t.isSpreadElement(arg)) continue;
            const val = astToValue(arg as t.Node, bindings);
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                Object.assign(merged, val);
                foundObject = true;
            }
        }
        return foundObject ? merged : undefined;
    }
    // Fallback for TSAsExpression etc
    if (t.isTSAsExpression(node) || t.isTSNonNullExpression(node) || t.isTypeCastExpression(node) || t.isParenthesizedExpression(node)) {
        return astToValue(node.expression, bindings);
    }

    return undefined;
};
