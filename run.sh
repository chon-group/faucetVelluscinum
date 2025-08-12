#! /bin/sh

#! /bin/bash
FRAMEWORK="/usr/bin/npm"
VELLUSCINUM="/usr/bin/velluscinum"

clear
if [[ ! -f "$FRAMEWORK"  ]] || [[ ! -e "$VELLUSCINUM" ]]
then
    echo "Installing dependencies..."
    sudo clear
    echo "deb [trusted=yes] http://packages.chon.group/ chonos main" | sudo tee /etc/apt/sources.list.d/chonos.list
    sudo apt update
    sudo apt install npm velluscinum-cli -y
    clear
else
    echo "The computer has Jason, SimulIDE and Velluscinum"
fi

npm install
npm start