package harvester;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.Writer;
import java.net.URL;
import java.nio.channels.Channels;
import java.nio.channels.ReadableByteChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;
import org.json.simple.parser.ParseException;

/**
 * Utility to harvest ASGS regional statistics from the ABS.Stat web service, in
 * JSON format, and then process the data into a more compact format more
 * suitable for transmission.
 * 
 * @author Michael de Hoog
 */
public class Harvester
{
	private final static String LINE_SEPARATOR = System.getProperty("line.separator");
	private final static boolean OVERWRITE_PROCESSED = false;
	private final static String REGION_CONCEPT_ID = "REGION";
	private final static String REGION_TYPE_CONCEPT_ID = "REGIONTYPE";
	private final static String SA2_REGION_TYPE_CODE = "SA2";
	private final static int PROCESSING_THREAD_COUNT = 1;
	@SuppressWarnings("serial")
	private final static Set<String> UNITS_TO_IGNORE = new HashSet<String>()
	{
		{
			add("no.");
			add("no");
			add("number");
			add("#");
		}
	};

	public static class Dataset
	{
		public final String id;
		public final String description;
		public final List<Concept> concepts = new ArrayList<>();
		public final Map<String, Concept> conceptMap = new HashMap<>();

		public Dataset(String id, String description)
		{
			this.id = id;
			this.description = description;
		}

		@Override
		public String toString()
		{
			return "Dataset(" + id + ")";
		}
	}

	public static class Concept
	{
		public final Dataset dataset;
		public final String id;
		public final List<Code> codes = new ArrayList<>();
		public final List<Code> rootCodes = new ArrayList<>();
		public final Map<String, Code> allCodesMap = new HashMap<>();
		public final Set<Code> usedCodes = new HashSet<>();

		public Concept(Dataset dataset, String id)
		{
			this.dataset = dataset;
			this.id = id;
		}

		@Override
		public String toString()
		{
			return "Concept(" + id + ")";
		}
	}

	public static class Code
	{
		public final Concept concept;
		public final String id;
		public final String description;
		public final String units;
		public final String parentId;
		public Code parent;
		public final List<Code> children = new ArrayList<>();

		public Code(Concept concept, String id, String description, String units, String parentId)
		{
			this.concept = concept;
			this.id = id;
			this.description = description;
			this.units = units;
			this.parentId = parentId;
		}

		@Override
		public String toString()
		{
			return "Code(" + id + ")";
		}
	}

	public static class Data
	{
		public final Code code;
		public final Concept childConcept;
		public final DataValues values;
		public final List<Code> codes = new ArrayList<>();
		public final Map<Code, Data> data = new HashMap<>();
		public double min = Double.MAX_VALUE;
		public double max = -Double.MAX_VALUE;

		public Data(Code code, Concept childConcept, DataValues values)
		{
			this.code = code;
			this.childConcept = childConcept;
			this.values = values;
		}
	}

	public static class DataValues
	{
		public final List<String> times = new ArrayList<>();
		public final Map<String, String> values = new HashMap<>();
	}

	public static void main(String[] args) throws IOException, ParseException
	{
		File rootDir = new File("downloaded");
		File processedDirectory = new File(rootDir, "processed");
		Writer errorWriter = new FileWriter(new File(rootDir, "errors.txt"));

		System.out.println("Loading datasets");

		File datasetFile = new File(rootDir, "datasetList.json");
		JSONObject datasetsJson = downloadDatasetList(datasetFile);

		final List<Dataset> datasets = new ArrayList<>();
		JSONArray datasetsArray = (JSONArray) datasetsJson.get("datasets");
		for (int i = 0; i < datasetsArray.size(); i++)
		{
			JSONObject datasetObject = (JSONObject) datasetsArray.get(i);
			String datasetId = (String) datasetObject.get("id");
			String datasetDescription = (String) datasetObject.get("description");
			Dataset dataset = new Dataset(datasetId, datasetDescription);
			File conceptsFile = conceptsFile(rootDir, datasetId);
			JSONObject conceptsJson = downloadDatasetConcepts(datasetId, conceptsFile);
			JSONArray concepts = (JSONArray) conceptsJson.get("concepts");
			if (concepts == null)
			{
				continue;
			}
			boolean regionTypeCorrect = false;
			if (concepts.contains(REGION_TYPE_CONCEPT_ID) && concepts.contains(REGION_CONCEPT_ID))
			{
				File codeListFile = codeListFile(rootDir, datasetId, REGION_TYPE_CONCEPT_ID);
				JSONObject regionTypesJson = downloadCodeListValue(datasetId, REGION_TYPE_CONCEPT_ID, codeListFile);
				JSONArray codes = (JSONArray) regionTypesJson.get("codes");
				for (int j = 0; j < codes.size(); j++)
				{
					JSONObject code = (JSONObject) codes.get(j);
					String codeId = (String) code.get("code");
					if (SA2_REGION_TYPE_CODE.equals(codeId))
					{
						regionTypeCorrect = true;
						break;
					}
				}
			}

			if (!regionTypeCorrect)
			{
				continue;
			}

			datasets.add(dataset);

			for (int j = 0; j < concepts.size(); j++)
			{
				String conceptId = (String) concepts.get(j);
				Concept concept = new Concept(dataset, conceptId);
				dataset.concepts.add(concept);
				dataset.conceptMap.put(conceptId, concept);
				File codeListFile = codeListFile(rootDir, datasetId, conceptId);
				JSONObject codeListJson = downloadCodeListValue(datasetId, conceptId, codeListFile);
				JSONArray codes = (JSONArray) codeListJson.get("codes");
				for (int k = 0; k < codes.size(); k++)
				{
					JSONObject codeJson = (JSONObject) codes.get(k);
					String codeId = (String) codeJson.get("code");
					if (dataset.description.equals(codeId))
					{
						//for some reason the ABS returns the dataset description for one of the codes?
						continue;
					}
					String parentId = (String) codeJson.get("parentCode");
					String codeDescription = (String) codeJson.get("description");
					codeDescription = codeDescription.replace("\\", ""); //remove any escaping backslashes
					codeDescription = codeDescription.replaceAll("\\s+", " ").trim(); //remove any double spaces
					String units = null;
					Pattern unitsPattern = Pattern.compile(".*?(\\s*\\((.+)\\)).*");
					Matcher matcher = unitsPattern.matcher(codeDescription);
					if (matcher.matches())
					{
						codeDescription = codeDescription.substring(0, matcher.start(1))
								+ codeDescription.substring(matcher.end(1));
						units = matcher.group(2).trim();
						if (UNITS_TO_IGNORE.contains(units.toLowerCase()))
						{
							units = null;
						}
					}
					Code code = new Code(concept, codeId, codeDescription, units, parentId);
					concept.codes.add(code);
					concept.allCodesMap.put(codeId, code);
				}

				for (Code code : concept.codes)
				{
					if (code.parentId == null || code.parentId.length() == 0)
					{
						concept.rootCodes.add(code);
					}
					else
					{
						Code parent = concept.allCodesMap.get(code.parentId);
						assertTrue(parent != null, "Could not find parent code '" + code.parentId + "' for code '"
								+ code.id + "' (dataset = '" + datasetId + "', concept = '" + conceptId + "')");
						code.parent = parent;
						parent.children.add(code);
					}
				}
			}
		}

		List<Thread> threads = new ArrayList<>();
		final AtomicInteger datasetIndex = new AtomicInteger(0);
		for (int t = 0; t < PROCESSING_THREAD_COUNT; t++)
		{
			Thread thread = new Thread(new Runnable()
			{
				@Override
				public void run()
				{
					while (true)
					{
						int index = datasetIndex.getAndIncrement();
						if (index >= datasets.size())
						{
							break;
						}
						Dataset dataset = datasets.get(index);
						try
						{
							processDataset(dataset, rootDir, processedDirectory, errorWriter);
						}
						catch (Exception e)
						{
							try
							{
								errorWriter.write("Error processing dataset " + dataset.id + ": "
										+ e.getLocalizedMessage());
								errorWriter.flush();
							}
							catch (IOException e1)
							{
								e1.printStackTrace();
							}
						}
					}
				}
			});
			thread.start();
			threads.add(thread);
		}

		for (Thread thread : threads)
		{
			try
			{
				thread.join();
			}
			catch (InterruptedException e)
			{
			}
		}

		errorWriter.close();

		saveDatasetSummary(datasets, new File(processedDirectory, "datasets.json"));

		System.out.println("Done");
	}

	private static void processDataset(Dataset dataset, File rootDir, File processedDirectory, Writer errorWriter)
			throws IOException
	{
		File processedDatasetDirectory = new File(processedDirectory, dataset.id);
		File summaryFile = new File(processedDatasetDirectory, "summary.json");

		if (summaryFile.exists() && !OVERWRITE_PROCESSED)
		{
			return;
		}

		if (dataset.id.startsWith("ABS_CENSUS2011_B"))
		{
			//only ABS_CENSUS2011_B01, ABS_CENSUS2011_B02, and ABS_CENSUS2011_B03 seem to work
			if (!(dataset.id.endsWith("01") || dataset.id.endsWith("02")/* || dataset.id.endsWith("03")*/))
			{
				return;
			}
		}
		if (dataset.id.equals("ABS_ANNUAL_ERP_ASGS"))
		{
			//ABS_ANNUAL_ERP_ASGS doesn't work
			return;
		}

		System.out.println("Processing data for dataset '" + dataset.id + "'");

		List<Concept> combinationConcepts = new ArrayList<>();
		Set<Concept> ignoredConcepts = new HashSet<>();
		for (Concept concept : dataset.concepts)
		{
			if (REGION_CONCEPT_ID.equals(concept.id))
			{
				continue;
			}
			else if (REGION_TYPE_CONCEPT_ID.equals(concept.id) || "STATE".equals(concept.id)
					|| "FREQUENCY".equals(concept.id))
			{
				ignoredConcepts.add(concept);
			}
			else
			{
				combinationConcepts.add(concept);
			}
		}
		//region is the last dimension in the cube:
		Concept regionConcept = dataset.conceptMap.get(REGION_CONCEPT_ID);
		combinationConcepts.add(regionConcept);

		int sum = 1;
		String conceptString = "";
		for (Concept concept : combinationConcepts)
		{
			if (concept == regionConcept)
			{
				continue;
			}
			sum *= concept.codes.size();
			conceptString += ", " + concept.id + "(" + concept.codes.size() + ")";
		}
		conceptString = conceptString.length() < 2 ? conceptString : conceptString.substring(2);
		System.out.println("Found " + sum + " observation(s) per region, with concepts: " + conceptString);

		Data rootData = new Data(null, combinationConcepts.get(0), null);

		//5 levels to download:
		//AUS: http://stat.abs.gov.au/itt/query.jsp?method=GetGenericData&datasetid=ABS_NRP9_ASGS&and=REGION.0
		//STE: http://stat.abs.gov.au/itt/query.jsp?method=GetGenericData&datasetid=ABS_NRP9_ASGS&and=REGIONTYPE.STE&orParent=REGION.0
		//SA4: http://stat.abs.gov.au/itt/query.jsp?method=GetGenericData&datasetid=ABS_NRP9_ASGS&and=REGIONTYPE.SA4&orParent=REGION.1
		//SA3: http://stat.abs.gov.au/itt/query.jsp?method=GetGenericData&datasetid=ABS_NRP9_ASGS&and=REGIONTYPE.SA3&orParent=REGION.101
		//SA2: http://stat.abs.gov.au/itt/query.jsp?method=GetGenericData&datasetid=ABS_NRP9_ASGS&and=REGIONTYPE.SA2&orParent=REGION.10101

		String[] regionTypes = { "AUS", "STE", "SA4", "SA3", "SA2" };
		int[] orParentLevels = { -1, 0, 1, 2, 3 };
		Code parentRegionCode = regionConcept.allCodesMap.get("0");
		for (int level = 0; level < 5; level++)
		{
			String regionType = regionTypes[level];
			List<Code> codes = new ArrayList<>();
			if (level == 0)
			{
				codes.add(parentRegionCode);
			}
			else
			{
				addCodeChildrenToListAtLevel0(parentRegionCode, codes, orParentLevels[level]);
			}

			for (Code code : codes)
			{
				String url = "http://stat.abs.gov.au/itt/query.jsp?method=GetGenericData&datasetid=" + dataset.id;
				url += level == 0 ? ("&and=REGION.0")
						: ("&and=REGIONTYPE." + regionType + "&orParent=REGION." + code.id);
				File file = new File(rootDir, "data/" + dataset.id + "/" + regionType + "/"
						+ (level == 0 ? "" : "parent") + code.id + ".json");

				JSONObject data = null;
				JSONArray series = null;
				int retries = 2;
				for (int retry = 0; retry < retries; retry++)
				{
					if (retry > 0)
					{
						System.out.println("Downloading from " + url + " failed, retrying (attempt " + (retry + 1)
								+ "/" + retries + ")");
					}
					try
					{
						data = downloadJSONObject(new URL(url), file);
						series = (JSONArray) data.get("series");
						if (series != null)
						{
							break;
						}
					}
					catch (Exception e)
					{
					}
					file.delete();
				}
				if (series == null)
				{
					String message = "Error downloading from " + url + ", data = " + data;
					System.err.println(message);
					errorWriter.write(dataset.id + ": " + message + LINE_SEPARATOR);
					errorWriter.flush();
					//try next URL (we can always rerun)
					continue;
				}
				//assertTrue(series != null, "Error downloading from " + url);

				for (int i = 0; i < series.size(); i++)
				{
					JSONObject serie = (JSONObject) series.get(i);
					JSONArray conceptsArray = (JSONArray) serie.get("concepts");
					Map<Concept, Code> codesFromCombinations = new HashMap<>();
					for (int j = 0; j < conceptsArray.size(); j++)
					{
						JSONObject conceptJson = (JSONObject) conceptsArray.get(j);
						String conceptName = (String) conceptJson.get("name");
						String conceptValue = (String) conceptJson.get("Value");
						Concept concept = dataset.conceptMap.get(conceptName);
						assertTrue(concept != null, "Unknown concept returned in data: " + conceptName);
						if (ignoredConcepts.contains(concept))
						{
							continue;
						}
						assertTrue(!codesFromCombinations.containsKey(concept), "A value for concept '" + conceptName
								+ "' has already been defined for this data");
						Code conceptCode = concept.allCodesMap.get(conceptValue);
						assertTrue(code != null, "Unknown concept code returned in data '" + conceptValue
								+ "' for concept '" + conceptName + "'");
						concept.usedCodes.add(conceptCode);
						codesFromCombinations.put(concept, conceptCode);
					}

					assertTrue(codesFromCombinations.keySet().containsAll(combinationConcepts),
							"Not all concepts from the combination were included in the data");

					DataValues values = new DataValues();
					JSONArray observationsArray = (JSONArray) serie.get("observations");
					for (int j = 0; j < observationsArray.size(); j++)
					{
						JSONObject observationJson = (JSONObject) observationsArray.get(j);
						String observationTime = (String) observationJson.get("Time");
						String observationValue = (String) observationJson.get("Value");

						assertTrue(!values.values.containsKey(observationTime), "Value for time '" + observationTime
								+ "' has already been added");

						values.times.add(observationTime);
						values.values.put(observationTime, observationValue);
					}

					insertData(combinationConcepts, 0, codesFromCombinations, rootData, values);
				}
			}
		}

		System.out.println("Saving processed data for dataset '" + dataset.id + "'");

		saveData(rootData, processedDatasetDirectory, combinationConcepts.get(combinationConcepts.size() - 1));
		saveSummary(dataset, summaryFile, combinationConcepts);
	}

	private static void assertTrue(boolean value, String message)
	{
		if (!value)
		{
			throw new IllegalStateException(message);
		}
	}

	private static void addCodeChildrenToListAtLevel0(Code parentCode, List<Code> list, int level)
	{
		if (level == 0)
		{
			list.add(parentCode);
		}
		else if (level > 0)
		{
			for (Code code : parentCode.children)
			{
				addCodeChildrenToListAtLevel0(code, list, level - 1);
			}
		}
	}

	private static File conceptsFile(File rootDir, String datasetId)
	{
		return new File(rootDir, "concepts/" + datasetId + ".json");
	}

	private static File codeListFile(File rootDir, String datasetId, String conceptId)
	{
		return new File(rootDir, "codeLists/" + datasetId + "/" + conceptId + ".json");
	}

	private static JSONObject downloadDatasetList(File path) throws IOException, ParseException
	{
		URL url = new URL("http://stat.abs.gov.au/itt/query.jsp?method=GetDatasetList");
		return downloadJSONObject(url, path);
	}

	private static JSONObject downloadDatasetConcepts(String datasetId, File path) throws IOException, ParseException
	{
		URL url = new URL("http://stat.abs.gov.au/itt/query.jsp?method=GetDatasetConcepts&datasetid=" + datasetId);
		return downloadJSONObject(url, path);
	}

	private static JSONObject downloadCodeListValue(String datasetId, String concept, File path) throws IOException,
			ParseException
	{
		URL url = new URL("http://stat.abs.gov.au/itt/query.jsp?method=GetCodeListValue&datasetid=" + datasetId
				+ "&concept=" + concept + "&format=json");
		return downloadJSONObject(url, path);
	}

	private static JSONObject downloadJSONObject(URL url, File path) throws IOException, ParseException
	{
		if (!path.exists())
		{
			downloadFile(url, path);
		}
		JSONParser parser = new JSONParser();
		try (FileReader reader = new FileReader(path))
		{
			return (JSONObject) parser.parse(reader);
		}
	}

	private static void downloadFile(URL url, File file) throws IOException
	{
		if (file.getParentFile() != null)
		{
			file.getParentFile().mkdirs();
		}
		System.out.println("Downloading " + url);
		ReadableByteChannel rbc = Channels.newChannel(url.openStream());
		FileOutputStream fos = new FileOutputStream(file);
		fos.getChannel().transferFrom(rbc, 0, Long.MAX_VALUE);
		fos.close();
	}

	private static void insertData(List<Concept> combinationConcepts, int conceptIndex, Map<Concept, Code> codes,
			Data into, DataValues values)
	{
		Concept concept = combinationConcepts.get(conceptIndex);
		Code code = codes.get(concept);

		Data data = into.data.get(code);
		if (conceptIndex >= combinationConcepts.size() - 1)
		{
			//last one, insert values
			assertTrue(data == null, "Already a data value for " + code.id);
			data = new Data(code, null, values);
			into.codes.add(code);
			into.data.put(code, data);
		}
		else
		{
			if (data == null)
			{
				data = new Data(code, combinationConcepts.get(conceptIndex + 1), null);
				into.codes.add(code);
				into.data.put(code, data);
			}
			insertData(combinationConcepts, conceptIndex + 1, codes, data, values);
		}
	}

	private static void saveData(Data data, File file, Concept lastConcept) throws IOException
	{
		if (data.childConcept == lastConcept)
		{
			File jsonFile = new File(file.getParentFile(), file.getName() + ".json");
			JSONObject json = saveData(data);
			jsonFile.getParentFile().mkdirs();
			try (FileWriter writer = new FileWriter(jsonFile))
			{
				json.writeJSONString(writer);
			}
		}
		else
		{
			for (Code code : data.codes)
			{
				Data child = data.data.get(code);
				File childFile = new File(file, data.childConcept.id + "." + code.id);
				saveData(child, childFile, lastConcept);
			}
		}
	}

	@SuppressWarnings("unchecked")
	private static JSONObject saveData(Data data)
	{
		Map<String, Integer> timeCounts = new HashMap<>();
		fillTimeCounts(data, timeCounts);
		int dataCount = dataCount(data);
		calculateMinMax(data, data);

		List<String> times = new ArrayList<>(timeCounts.keySet());
		Collections.sort(times);

		//if a certain time only appears in less than 10% of the records, then ignore it
		for (int i = 0; i < times.size(); i++)
		{
			String time = times.get(i);
			int timeCount = timeCounts.get(time);
			if (timeCount / (double) dataCount < 0.1)
			{
				times.remove(i--);
				timeCounts.remove(time);
			}
		}

		Map<String, Object> json = new HashMap<>();

		json.put("concept", data.childConcept.id); //should always be "REGION"
		json.put("units", data.code.units);
		json.put("min", (Double) data.min);
		json.put("max", (Double) data.max);

		JSONArray timeArray = new JSONArray();
		for (String time : times)
		{
			timeArray.add(tryConvertToNumber(time));
		}
		json.put("times", timeArray);

		Map<String, Object> dataJson = new HashMap<>();
		for (Code code : data.codes)
		{
			Data child = data.data.get(code);
			DataValues values = child.values;
			assertTrue(values != null, "DataValues is null");

			boolean foundNonNull = false;
			for (String time : times)
			{
				String value = values.values.get(time);
				if (value != null)
				{
					foundNonNull = true;
					break;
				}
			}
			if (!foundNonNull)
			{
				//don't save observations that have no values
				continue;
			}

			JSONArray valueArray = new JSONArray();
			for (String time : times)
			{
				String value = values.values.get(time);
				valueArray.add(tryConvertToNumber(value));
			}
			dataJson.put(code.id, valueArray);
		}
		json.put("data", new JSONObject(dataJson));

		return new JSONObject(json);
	}

	@SuppressWarnings("unchecked")
	private static void saveSummary(Dataset dataset, File file, List<Concept> conceptsOrder) throws IOException
	{
		Map<String, Object> json = new HashMap<>();

		json.put("id", dataset.id);
		json.put("description", dataset.description);

		JSONArray conceptArray = new JSONArray();
		for (Concept concept : conceptsOrder)
		{
			if ("REGION".equals(concept.id))
			{
				//don't write region concept to summary file
				continue;
			}

			Map<String, Object> conceptJson = new HashMap<>();
			conceptJson.put("name", concept.id);

			JSONArray codesArray = new JSONArray();
			for (Code code : concept.codes)
			{
				if (!concept.usedCodes.contains(code))
				{
					//skip unused codes
					continue;
				}

				Map<String, Object> codeJson = new HashMap<>();

				codeJson.put("k", code.id);
				codeJson.put("v", code.description);
				codeJson.put("u", code.units);

				codesArray.add(new JSONObject(codeJson));
			}
			conceptJson.put("codes", codesArray);

			conceptArray.add(new JSONObject(conceptJson));
		}
		json.put("concepts", conceptArray);

		JSONObject jsonObject = new JSONObject(json);
		try (FileWriter writer = new FileWriter(file))
		{
			jsonObject.writeJSONString(writer);
		}
	}

	@SuppressWarnings("unchecked")
	private static void saveDatasetSummary(List<Dataset> datasets, File file) throws IOException
	{
		Map<String, Object> json = new HashMap<>();

		JSONArray datasetsArray = new JSONArray();
		for (Dataset dataset : datasets)
		{
			Map<String, Object> datasetJson = new HashMap<>();
			datasetJson.put("k", dataset.id);
			datasetJson.put("v", dataset.description);
			datasetsArray.add(new JSONObject(datasetJson));
		}
		json.put("datasets", datasetsArray);

		JSONObject jsonObject = new JSONObject(json);
		try (FileWriter writer = new FileWriter(file))
		{
			jsonObject.writeJSONString(writer);
		}
	}

	private static Object tryConvertToNumber(String s)
	{
		if (s == null)
		{
			return s;
		}
		try
		{
			return Long.valueOf(s);
		}
		catch (NumberFormatException e)
		{
			try
			{
				return Double.valueOf(s);
			}
			catch (NumberFormatException e2)
			{
				return s;
			}
		}
	}

	private static void fillTimeCounts(Data data, Map<String, Integer> counts)
	{
		if (data.values != null)
		{
			for (String time : data.values.times)
			{
				Integer count = counts.get(time);
				count = count == null ? 0 : count;
				counts.put(time, count + 1);
			}
		}
		for (Data child : data.data.values())
		{
			fillTimeCounts(child, counts);
		}
	}

	private static void calculateMinMax(Data data, Data store)
	{
		if (data.values != null)
		{
			for (String value : data.values.values.values())
			{
				if (value == null)
				{
					continue;
				}
				try
				{
					double d = Double.parseDouble(value);
					store.min = Math.min(store.min, d);
					store.max = Math.max(store.max, d);
				}
				catch (NumberFormatException e)
				{
				}
			}
		}
		for (Data child : data.data.values())
		{
			calculateMinMax(child, store);
		}
	}

	private static int dataCount(Data data)
	{
		int count = 0;
		if (data.values != null)
		{
			count++;
		}
		for (Data child : data.data.values())
		{
			count += dataCount(child);
		}
		return count;
	}
}
