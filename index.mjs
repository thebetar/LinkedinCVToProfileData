import fs from 'fs';
import PDFParser from 'pdf2json';

import validator from './validator.mjs';

const pdfParser = new PDFParser();

function parseValueToString(value) {
	return decodeURIComponent(value?.R?.[0]?.T || '');
}

pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError));
pdfParser.on('pdfParser_dataReady', pdfData => {
	const result = {};

	result.name = decodeURIComponent(
		pdfData.Pages[0].Texts.find(
			item => Number(item.x).toFixed(3) === '13.723' && Number(item.y).toFixed(3) === '3.347'
		).R[0].T
	);

	const leftRow = pdfData.Pages[0].Texts.filter(item => Number(item.x) === 1.1);
	const rightRow = pdfData.Pages.reduce((acc, page, index) => {
		return [...acc, ...page.Texts.filter(item => Number(item.x) >= 13.723).map(item => ({ ...item, index }))];
	}, []);

	result.email = parseValueToString(leftRow.find(item => item.R[0].T.includes('%40')));
	result.phone = parseValueToString(leftRow.find(item => validator.phone.test(item?.R?.[0]?.T)));

	const skillY = leftRow.find(item => item.R[0].T.includes('Belangrijkste%20vaardigheden')).y;
	const languageY = leftRow.find(item => item.R[0].T.includes('Languages')).y;
	const certificationY = leftRow.find(item => item.R[0].T.includes('Certifications')).y;

	result.skills = leftRow.filter(item => item.y > skillY && item.y < languageY).map(parseValueToString);
	result.languages = leftRow.filter(item => item.y > languageY && item.y < certificationY).map(parseValueToString);
	result.certifications = leftRow.filter(item => item.y > certificationY).map(parseValueToString);

	const workExperience = rightRow.find(item => item.R[0].T.includes('Ervaring'));
	const education = rightRow.find(item => item.R[0].T.includes('Opleiding'));

	const initialReduceObject = () => ({
		timesAgoAdded: 0,
		lastY: 0,
		items: []
	});

	function getYearStartAndYearEndFromString(string) {
		const years = string.split('-').map(value => decodeURIComponent(value).trim());
		return {
			yearStart: Number(years[0].split(' ').pop()),
			yearEnd: Number(years[1]?.split('(')?.[0]?.split(' ')?.pop()) || 'Present'
		};
	}

	function reduceWorkExperience(acc, item) {
		if (item.y - acc.lastY > 2.35) {
			acc.items.push({ company: parseValueToString(item) });
			acc.timesAgoAdded = 0;
		} else {
			acc.timesAgoAdded++;
		}

		switch (acc.timesAgoAdded) {
			case 1:
				acc.items[acc.items.length - 1].title = parseValueToString(item);
				break;
			case 2:
				acc.items[acc.items.length - 1] = {
					...acc.items[acc.items.length - 1],
					...getYearStartAndYearEndFromString(item.R[0].T)
				};
				break;
		}

		acc.lastY = item.y;
		return acc;
	}

	function reduceEducation(acc, item) {
		if (item.y - acc.lastY > 2.05) {
			acc.items.push({ institution: parseValueToString(item) });
			acc.timesAgoAdded = 0;
		} else {
			acc.timesAgoAdded++;
		}

		if (acc.timesAgoAdded > 0) {
			if (acc.timesAgoAdded === 1) {
				acc.string = '';
			}
			acc.string += ` ${parseValueToString(item)}`;
		}

		if (acc.string && acc.timesAgoAdded === 0) {
			const title = acc.string.split('·')[0];
			const yearFinished = Number(acc.string.split('-').pop().replace(')', '').trim());
			acc.items[acc.items.length - 2] = {
				...acc.items[acc.items.length - 2],
				title,
				yearFinished
			};
			acc.string = '';
		}

		acc.lastY = item.y;
		return acc;
	}

	if (workExperience.index === education.index) {
		// If work experience and education are on the same page then we can just filter between the two
		result.workExperience = rightRow
			.filter(item => item.index >= workExperience.index && item.y > workExperience.y && item.y < education.y)
			.reduce(reduceWorkExperience, initialReduceObject()).items;
	} else {
		// If work experience and education are on different pages then we need to filter between the two
		result.workExperience = rightRow
			.filter(
				item =>
					(item.index === workExperience.index && item.y > workExperience.y) ||
					(item.index === education.index && item.y < education.y) ||
					(item.index > workExperience.index && item.index < education.index)
			)
			.reduce(reduceWorkExperience, initialReduceObject()).items;
	}

	result.education = rightRow
		.filter(
			item =>
				((item.index === education.index && item.y > education.y) || item.index > education.index) &&
				index.y >= 47
		)
		.reduce(reduceEducation, initialReduceObject()).items;

	fs.writeFileSync(`result/result-${result.name}.json`, JSON.stringify(result, null, 2));
});

pdfParser.loadPDF('profiles/Profile-David.pdf');
