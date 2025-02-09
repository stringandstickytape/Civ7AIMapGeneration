using System.Text;


namespace PngPreprocessor
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

        private void button1_Click(object sender, EventArgs e)
        {
            // Check if the clipboard contains an image.
            if (Clipboard.ContainsImage())
            {
                Image clipboardImage = Clipboard.GetImage();
                // Process the image from clipboard to produce the map definition.
                string mapString = PlanetImagePreprocessor.ProcessPlanetImage(clipboardImage);

                // Copy the resulting string to the clipboard.
                Clipboard.SetText(mapString);
                MessageBox.Show("Map string copied to clipboard.", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show("Clipboard does not contain a valid image.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }


public static class PlanetImagePreprocessor
    {
        // Process the image at imagePath and build a string where each character
        // represents one tile based on the pixel's color.
        public static string ProcessPlanetImage(Image image)
        {
            using (Bitmap bmp = new Bitmap(image))
            {
                int width = bmp.Width;
                int height = bmp.Height;
                StringBuilder mapDefinition = new StringBuilder();

                // Loop over every row and column
                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        Color pixel = bmp.GetPixel(x, y);
                        char tile = MapColorToLetter(pixel);
                        mapDefinition.Append(tile);
                    }
                    mapDefinition.AppendLine();
                }

                return mapDefinition.ToString();
            }
        }




        // Map the color of a pixel to a letter.
        // For example: 'W' = water, 'G' = green/forest, 'D' = desert, 'M' = mountain,
        // and 'L' = generic land.
        private static char MapColorToLetter(Color color)
        {
            // If blue is dominant beyond a threshold then consider it water.
            if (color.B > color.R + 10 && color.B > color.G + 10)
            {
                return 'W';
            }
            // If green is dominant then assume grassland/forest.
            if (color.G > color.R && color.G > color.B)
            {
                return 'L';
            }
            // If red is dominant, perhaps desert (if very bright) otherwise plain land.
            if (color.R > color.G && color.R > color.B)
            {
                if (color.R > 200 && color.G > 200 && color.B < 150)
                    return 'L';
                return 'L';
            }
            // If overall brightness is low, treat it as mountain.
            int brightness = (color.R + color.G + color.B) / 3;
            if (brightness < 70)
            {
                return 'L';
            }
            // Default to generic land.
            return 'L';
        }
    }

}


//W: Water
//G: Grassland/Forest
//D: Desert
//M: Mountain
//L: Generic Land

