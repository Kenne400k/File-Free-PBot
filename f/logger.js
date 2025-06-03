'use strict';

const chalk = require('chalk');
const isHexcolor = require('is-hexcolor');

// Lấy tên hệ thống hoặc mặc định
function getMainName() {
	const name = global.Fca?.Require?.FastConfig?.MainName || "[ FCA-HZI ]";
	const color = global.Fca?.Require?.FastConfig?.MainColor || "#00FFFF";
	return chalk.hex(color).bold(name);
}

// Lấy icon theo loại log
function getIcon(type) {
	switch(type) {
		case "info": return chalk.cyan('ℹ️');
		case "success": return chalk.green('✔️');
		case "warn": return chalk.yellow('⚠️');
		case "error": return chalk.red('✖️');
		case "normal": return chalk.magenta('●');
		default: return '';
	}
}

// Định dạng text có tham số
function getText(...Data) {
	let Main = (Data.splice(0,1)).toString();
	for (let i = 0; i < Data.length; i++) Main = Main.replace(RegExp(`%${i + 1}`, 'g'), Data[i]);
	return Main;
}
function getType(obj) {
	return Object.prototype.toString.call(obj).slice(8, -1);
}

// In ra header nhỏ gọn cùng message trên 1 dòng
function printHeaderMsg(type, msg) {
	console.log(`${getMainName()} ${getIcon(type)} ${msg}`);
}

module.exports = {
	Normal: function(Str, Data, Callback) {
		const color = global.Fca?.Require?.FastConfig?.MainColor || "#00FFFF";
		if (!isHexcolor(color)) {
			this.Warning(getText(global.Fca.Require.Language.Index.InvaildMainColor, color), process.exit(0));
			return;
		}
		printHeaderMsg("normal", chalk.hex(color)(Str));
		if (getType(Data) == 'Function' || getType(Data) == 'AsyncFunction') return Data();
		if (Data) return Data;
		if (getType(Callback) == 'Function' || getType(Callback) == 'AsyncFunction') Callback();
		else return Callback;
	},
	Warning: function(str, callback) {
		printHeaderMsg("warn", chalk.yellow(str));
		if (getType(callback) == 'Function' || getType(callback) == 'AsyncFunction') callback();
		else return callback;
	},
	Error: function(str, callback) {
		if (!str) str = "Already Faulty, Please Contact: Facebook.com/pcoder090";
		printHeaderMsg("error", chalk.red(str));
		if (getType(callback) == 'Function' || getType(callback) == 'AsyncFunction') callback();
		else return callback;
	},
	Success: function(str, callback) {
		printHeaderMsg("success", chalk.green(str));
		if (getType(callback) == 'Function' || getType(Callback) == 'AsyncFunction') callback();
		else return callback;
	},
	Info: function(str, callback) {
		printHeaderMsg("info", chalk.cyan(str));
		if (getType(callback) == 'Function' || getType(callback) == 'AsyncFunction') callback();
		else return callback;
	}
};